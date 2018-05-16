FROM node:8.10.0-alpine

RUN apk update && apk upgrade && \
    apk -Uuv add --no-cache make g++ git python

RUN apk update && apk upgrade

RUN mkdir -p /home/dydx/app
WORKDIR /home/dydx/app

COPY package.json /home/dydx/app/package.json
COPY package-lock.json /home/dydx/app/package-lock.json
RUN npm install --loglevel warn

COPY ./truffle.js /home/dydx/app/truffle.js
COPY ./scripts /home/dydx/app/scripts
COPY ./migrations /home/dydx/app/migrations
COPY ./contracts /home/dydx/app/contracts

RUN npm run compile -- --all

EXPOSE 8545

CMD ["sh", "scripts/docker.sh"]
