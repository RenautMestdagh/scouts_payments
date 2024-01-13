FROM node:lts-bookworm-slim
RUN apt-get update
WORKDIR /usr/app
COPY package*.json .
RUN npm install
COPY . .
EXPOSE 7070
CMD [ "npm", "start"]
