FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npm run prisma:generate

COPY . .

EXPOSE 3000 3001

CMD ["npm", "run", "start"]
