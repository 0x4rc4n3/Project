FROM node:24

WORKDIR /app

# Install native compilation dependencies for SQLite and native modules
RUN apt-get update && apt-get install -y python3 make g++ libnode-dev && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install
RUN npm rebuild better-sqlite3 --build-from-source

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
