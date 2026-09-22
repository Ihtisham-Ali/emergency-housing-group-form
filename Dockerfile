FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY index.html ./
COPY styles.css ./
COPY app.js ./
COPY data.js ./
COPY logo.png ./
COPY bg.png ./
COPY submit.php ./

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]
