FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci && npx prisma generate

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && npm run start"]
