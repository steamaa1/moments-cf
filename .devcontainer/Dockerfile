FROM mcr.microsoft.com/devcontainers/javascript-node:20-bookworm

ENV APP_HOME=/app
RUN mkdir -p $APP_HOME
WORKDIR $APP_HOME

RUN set -x \
    && curl -L -o go1.23.3.linux-amd64.tar.gz https://go.dev/dl/go1.23.3.linux-amd64.tar.gz \
    && tar -xzf go1.23.3.linux-amd64.tar.gz \
    && echo 'export PATH=$PATH:/app/go/bin' > /etc/profile.d/enable-go.sh \
    && chmod +x /etc/profile.d/enable-go.sh

ENTRYPOINT ["sleep", "infinity"]
