FROM node:20

RUN npm cache clean --force
RUN rm -rf node_modules package-lock.json

# todo install dependencies

# work dir
WORKDIR /usr/src/app

# copy files
COPY . .

# install npm dependencies
RUN npm install

# expose port
EXPOSE 3000

# start app
CMD ["node", "app.js"]