FROM mcr.microsoft.com/playwright/python:v1.58.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install --with-deps chromium
RUN apt-get update \
    && apt-get install -y --no-install-recommends xvfb x11vnc novnc websockify \
    && ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html \
    && rm -rf /var/lib/apt/lists/*

COPY . .
COPY docker-entrypoint.sh /usr/local/bin/shein-api-entrypoint
RUN chmod +x /usr/local/bin/shein-api-entrypoint

ENV PLAYWRIGHT_HEADLESS=1
ENV SHEIN_PLAYWRIGHT_CHANNEL=chromium
ENV SHEIN_PLAYWRIGHT_PROFILES_DIR=/app/profiles
ENV SHEIN_ENABLE_REMOTE_BROWSER=1
ENV DISPLAY=:99
ENV PYTHONUNBUFFERED=1

EXPOSE 8000 6080

ENTRYPOINT ["/usr/local/bin/shein-api-entrypoint"]
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
