FROM node:22-alpine
RUN addgroup -S agent && adduser -S agent -G agent
USER agent
WORKDIR /workspace
ENTRYPOINT ["/bin/sh"]
