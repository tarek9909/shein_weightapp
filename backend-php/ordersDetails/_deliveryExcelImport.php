<?php

function delivery_norm_name(string $name): string {
  $v = trim($name);
  $v = preg_replace('/\([^)]*\)/', '', $v); // remove location suffix
  $v = preg_replace('/[^a-z0-9\s]+/i', ' ', $v);
  $v = strtolower(trim(preg_replace('/\s+/', ' ', $v)));
  return $v;
}

function delivery_excel_col_to_idx(string $cellRef): int {
  if (!preg_match('/^([A-Z]+)/i', $cellRef, $m)) return -1;
  $letters = strtoupper($m[1]);
  $idx = 0;
  for ($i = 0; $i < strlen($letters); $i++) {
    $idx = $idx * 26 + (ord($letters[$i]) - 64);
  }
  return $idx - 1;
}

function delivery_xml_unescape(string $v): string {
  return html_entity_decode($v, ENT_QUOTES | ENT_XML1, 'UTF-8');
}

function delivery_xlsx_shared_strings_regex(string $xml): array {
  $out = [];
  if ($xml === "") return $out;
  if (!preg_match_all('/<si\b[^>]*>(.*?)<\/si>/si', $xml, $mSi)) return $out;
  foreach ($mSi[1] as $siInner) {
    $txt = "";
    if (preg_match_all('/<t\b[^>]*>(.*?)<\/t>/si', $siInner, $mT)) {
      foreach ($mT[1] as $t) $txt .= delivery_xml_unescape(strip_tags($t));
    } else {
      $txt = delivery_xml_unescape(trim(strip_tags($siInner)));
    }
    $out[] = $txt;
  }
  return $out;
}

function delivery_xlsx_rows_regex(string $sheetXml, array $ss): array {
  $rows = [];
  if ($sheetXml === "") return $rows;
  if (!preg_match_all('/<row\b([^>]*)>(.*?)<\/row>/si', $sheetXml, $mRows, PREG_SET_ORDER)) return $rows;
  foreach ($mRows as $rowMatch) {
    $rowAttrs = $rowMatch[1] ?? "";
    $rowInner = $rowMatch[2] ?? "";
    $rowNum = 0;
    if (preg_match('/\br="(\d+)"/i', $rowAttrs, $mR)) $rowNum = (int)$mR[1];
    $cells = [];
    if (preg_match_all('/<c\b([^>]*)>(.*?)<\/c>/si', $rowInner, $mCells, PREG_SET_ORDER)) {
      foreach ($mCells as $cellMatch) {
        $cAttrs = $cellMatch[1] ?? "";
        $cInner = $cellMatch[2] ?? "";
        if (!preg_match('/\br="([^"]+)"/i', $cAttrs, $mRef)) continue;
        $idx = delivery_excel_col_to_idx((string)$mRef[1]);
        if ($idx < 0) continue;
        $type = "";
        if (preg_match('/\bt="([^"]+)"/i', $cAttrs, $mType)) $type = (string)$mType[1];
        $val = "";
        if ($type === "inlineStr") {
          if (preg_match_all('/<t\b[^>]*>(.*?)<\/t>/si', $cInner, $mT)) {
            foreach ($mT[1] as $t) $val .= delivery_xml_unescape(strip_tags($t));
          }
        } else {
          if (preg_match('/<v\b[^>]*>(.*?)<\/v>/si', $cInner, $mV)) {
            $val = trim(delivery_xml_unescape(strip_tags((string)$mV[1])));
          }
          if ($type === "s" && $val !== "") {
            $ssi = (int)$val;
            $val = $ss[$ssi] ?? "";
          }
        }
        $cells[$idx] = trim($val);
      }
    } else {
      // handle self-closing empty cells if needed; skip because they carry no value
    }
    if ($cells) {
      $max = max(array_keys($cells));
      $dense = array_fill(0, $max + 1, "");
      foreach ($cells as $i => $v) $dense[$i] = $v;
      $rows[] = ["row_num" => $rowNum, "cells" => $dense];
    }
  }
  return $rows;
}

function delivery_xlsx_rows(string $filePath): array {
  if (!class_exists('ZipArchive')) throw new Exception("ZipArchive extension is required for XLSX import");
  $zip = new ZipArchive();
  if ($zip->open($filePath) !== true) throw new Exception("Unable to open Excel file");

  $sheetXml = $zip->getFromName("xl/worksheets/sheet1.xml");
  if ($sheetXml === false) throw new Exception("sheet1.xml not found");

  $ss = [];
  $shared = $zip->getFromName("xl/sharedStrings.xml");
  if ($shared !== false) {
    $rootSS = @simplexml_load_string($shared);
    if ($rootSS !== false) {
      $rootSS->registerXPathNamespace("a", "http://schemas.openxmlformats.org/spreadsheetml/2006/main");
      $siNodes = $rootSS->xpath("//a:si");
      if (!is_array($siNodes)) $siNodes = [];
      foreach ($siNodes as $si) {
        $txt = "";
        $tNodes = $si->xpath(".//a:t");
        if (!is_array($tNodes) || !$tNodes) {
          // Fallback for hosts where xpath/namespace handling is inconsistent
          foreach ($si->children("http://schemas.openxmlformats.org/spreadsheetml/2006/main") as $child) {
            if ($child->getName() === "t") $txt .= (string)$child;
            if ($child->getName() === "r") {
              foreach ($child->children("http://schemas.openxmlformats.org/spreadsheetml/2006/main") as $rc) {
                if ($rc->getName() === "t") $txt .= (string)$rc;
              }
            }
          }
        } else {
          foreach ($tNodes as $t) $txt .= (string)$t;
        }
        $ss[] = $txt;
      }
    }
    if (!$ss) {
      $ss = delivery_xlsx_shared_strings_regex($shared);
    }
  }
  $zip->close();

  $root = @simplexml_load_string($sheetXml);
  if ($root === false) throw new Exception("Unable to parse sheet XML");
  $root->registerXPathNamespace("a", "http://schemas.openxmlformats.org/spreadsheetml/2006/main");
  $rows = [];
  $rowNodes = $root->xpath("//a:sheetData/a:row");
  if (!is_array($rowNodes) || !$rowNodes) {
    // Fallback traversal for hosting environments where xpath+namespace fails
    $rowNodes = [];
    foreach ($root->children("http://schemas.openxmlformats.org/spreadsheetml/2006/main") as $child) {
      if ($child->getName() !== "sheetData") continue;
      foreach ($child->children("http://schemas.openxmlformats.org/spreadsheetml/2006/main") as $r) {
        if ($r->getName() === "row") $rowNodes[] = $r;
      }
    }
  }
  foreach ($rowNodes as $row) {
    $rowNum = (int)$row["r"];
    $cells = [];
    $cellNodes = $row->xpath("./a:c");
    if (!is_array($cellNodes) || !$cellNodes) {
      $cellNodes = [];
      foreach ($row->children("http://schemas.openxmlformats.org/spreadsheetml/2006/main") as $c) {
        if ($c->getName() === "c") $cellNodes[] = $c;
      }
    }
    foreach ($cellNodes as $c) {
      $ref = (string)$c["r"];
      $idx = delivery_excel_col_to_idx($ref);
      if ($idx < 0) continue;
      $type = (string)$c["t"];
      $val = "";
      if ($type === "inlineStr") {
        $parts = $c->xpath("./a:is//a:t");
        if (is_array($parts) && $parts) {
          foreach ($parts as $p) $val .= (string)$p;
        } else {
          foreach ($c->children("http://schemas.openxmlformats.org/spreadsheetml/2006/main") as $cc) {
            if ($cc->getName() !== "is") continue;
            foreach ($cc->children("http://schemas.openxmlformats.org/spreadsheetml/2006/main") as $icc) {
              if ($icc->getName() === "t") $val .= (string)$icc;
              if ($icc->getName() === "r") {
                foreach ($icc->children("http://schemas.openxmlformats.org/spreadsheetml/2006/main") as $rtc) {
                  if ($rtc->getName() === "t") $val .= (string)$rtc;
                }
              }
            }
          }
        }
      } else {
        $v = $c->xpath("./a:v");
        if (is_array($v) && isset($v[0])) {
          $val = (string)$v[0];
        } else {
          foreach ($c->children("http://schemas.openxmlformats.org/spreadsheetml/2006/main") as $cc) {
            if ($cc->getName() === "v") {
              $val = (string)$cc;
              break;
            }
          }
        }
        if ($type === "s" && $val !== "") {
          $ssi = (int)$val;
          $val = $ss[$ssi] ?? "";
        }
      }
      $cells[$idx] = trim($val);
    }
    if ($cells) {
      $max = max(array_keys($cells));
      $dense = array_fill(0, $max + 1, "");
      foreach ($cells as $i => $v) $dense[$i] = $v;
      $rows[] = ["row_num" => $rowNum, "cells" => $dense];
    }
  }
  if (!$rows) {
    $rows = delivery_xlsx_rows_regex($sheetXml, $ss);
  }
  if (!$rows) {
    throw new Exception("Excel file parsed but no rows were extracted (SimpleXML and regex parsers failed)");
  }
  return $rows;
}

function delivery_find_header_index(array $headers, array $candidates): int {
  foreach ($headers as $i => $h) {
    $hn = strtolower(trim((string)$h));
    foreach ($candidates as $cand) {
      if ($hn === strtolower($cand)) return (int)$i;
    }
  }
  return -1;
}

function delivery_to_float($v): float {
  $s = trim((string)$v);
  if ($s === "") return 0.0;
  $s = str_replace([",", "$"], ["", ""], $s);
  return is_numeric($s) ? (float)$s : 0.0;
}
