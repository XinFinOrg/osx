FROM node:18

RUN mkdir /osx

WORKDIR /osx

ADD ./yarn.lock ./yarn.lock

RUN yarn install

ADD . .

WORKDIR /osx/packages/contracts-ethers
RUN yarn build

WORKDIR /osx/packages/contracts
RUN yarn build

EXPOSE 8545

CMD [ "yarn", "dev" ]