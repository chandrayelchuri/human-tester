FROM mcr.microsoft.com/playwright:v1.48.0-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV HT_DATA_DIR=/data
VOLUME /data
EXPOSE 8787
# API mode for dashboards; override CMD to run a single test: docker run human-tester node bin/human-tester.js https://site.com
CMD ["node", "bin/human-tester.js", "serve", "--port", "8787"]
