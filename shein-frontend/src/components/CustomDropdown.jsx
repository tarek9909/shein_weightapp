import React, { useState, useRef, useEffect, useMemo } from "react";
import "../CustomDropdown.css";

/**
 * CustomDropdown
 * A luxury, accessible, searchable custom dropdown component.
 *
 * Props:
 * - value: string | number (current value)
 * - onChange: function(e) - passed an event-like object { target: { value, name } }
 * - options: Array<{ value: string|number, label: string|ReactNode, disabled?: boolean }> (optional)
 * - children: <option value="...">Label</option> (optional fallback if options array not passed)
 * - placeholder: string
 * - disabled: boolean
 * - className: string
 * - style: object
 * - searchable: boolean (auto-enabled if > 8 options unless explicitly false)
 * - name: string
 */
export default function CustomDropdown({
  value,
  onChange,
  options: optionsProp,
  children,
  placeholder = "-- Select --",
  disabled = false,
  className = "",
  style = {},
  searchable: searchableProp,
  name,
  id,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  // Normalize options from options prop OR <option> children
  const parsedOptions = useMemo(() => {
    if (Array.isArray(optionsProp)) {
      return optionsProp.map((opt) => {
        if (typeof opt === "object" && opt !== null) {
          return {
            value: opt.value !== undefined ? String(opt.value) : String(opt.id ?? ""),
            label: opt.label !== undefined ? opt.label : (opt.name ?? String(opt.value ?? "")),
            disabled: !!opt.disabled,
          };
        }
        return { value: String(opt), label: String(opt), disabled: false };
      });
    }

    if (children) {
      const items = [];
      React.Children.forEach(children, (child) => {
        if (!React.isValidElement(child)) return;
        if (child.type === "option") {
          items.push({
            value: child.props.value !== undefined ? String(child.props.value) : "",
            label: child.props.children || child.props.label || String(child.props.value || ""),
            disabled: !!child.props.disabled,
          });
        }
      });
      return items;
    }

    return [];
  }, [optionsProp, children]);

  // Determine if search should be enabled
  const isSearchable = useMemo(() => {
    if (typeof searchableProp === "boolean") return searchableProp;
    return parsedOptions.length > 8;
  }, [searchableProp, parsedOptions.length]);

  // Current selected option
  const selectedOption = useMemo(() => {
    const valStr = value !== undefined && value !== null ? String(value) : "";
    return parsedOptions.find((opt) => opt.value === valStr);
  }, [parsedOptions, value]);

  // Filtered options based on search input
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return parsedOptions;
    const q = search.toLowerCase().trim();
    return parsedOptions.filter((opt) => {
      const labelStr = typeof opt.label === "string" ? opt.label : String(opt.label || "");
      return labelStr.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q);
    });
  }, [parsedOptions, search]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && isSearchable) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, isSearchable]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[highlightIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightIndex, isOpen]);

  const handleSelect = (option) => {
    if (option.disabled || disabled) return;
    setIsOpen(false);
    setSearch("");
    setHighlightIndex(-1);

    if (onChange) {
      // Pass synthetic event for compatibility with standard <select> onChange
      const syntheticEvent = {
        target: {
          value: option.value,
          name: name || id || "",
        },
      };
      onChange(syntheticEvent);
    }
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setSearch("");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && filteredOptions[highlightIndex]) {
        handleSelect(filteredOptions[highlightIndex]);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`cddContainer ${isOpen ? "cddOpen" : ""} ${disabled ? "cddDisabled" : ""} ${className}`}
      style={style}
      onKeyDown={handleKeyDown}
      id={id}
    >
      {/* Trigger Button */}
      <button
        type="button"
        className="cddTrigger"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`cddLabel ${!selectedOption ? "cddPlaceholder" : ""}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="cddChevron">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="cddMenu" role="listbox">
          {isSearchable && (
            <div className="cddSearchWrap" onClick={(e) => e.stopPropagation()}>
              <svg
                className="cddSearchIcon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                className="cddSearchInput"
                placeholder="Search options..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlightIndex(0);
                }}
                onKeyDown={(e) => {
                  // Prevent space from closing or triggering parent button
                  e.stopPropagation();
                }}
              />
              {search && (
                <button
                  type="button"
                  className="cddSearchClear"
                  onClick={() => {
                    setSearch("");
                    searchInputRef.current?.focus();
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          <div ref={listRef} className="cddOptionsList">
            {filteredOptions.length === 0 ? (
              <div className="cddEmpty">No options found</div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = selectedOption && selectedOption.value === opt.value;
                const isHighlighted = highlightIndex === idx;

                return (
                  <div
                    key={`${opt.value}-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`cddOption ${isSelected ? "cddSelected" : ""} ${
                      isHighlighted ? "cddHighlighted" : ""
                    } ${opt.disabled ? "cddOptDisabled" : ""}`}
                    onClick={() => handleSelect(opt)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                  >
                    <span className="cddOptionText">{opt.label}</span>
                    {isSelected && (
                      <span className="cddCheckmark">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
