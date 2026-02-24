FROM node:20-slim
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY server.js .
# --max-old-space-size=3500 limita el heap a 3.5 GB, dejando algo de RAM para el sistema y otras estructuras
# ENTRYPOINT ["node", "--max-old-space-size=3500", "server.js"]

ENTRYPOINT ["node", "server.js"]