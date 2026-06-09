FROM node:20-slim

WORKDIR /app

# package files copy করা
COPY package.json ./
RUN npm install --production

# বাকি সব ফাইল copy করা
COPY . .

# HuggingFace Space port 7860 ব্যবহার করে
EXPOSE 7860

CMD ["node", "index.js"]
