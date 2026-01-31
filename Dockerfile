# --- Build Stage ---
FROM node:20-alpine as build
WORKDIR /app
COPY package.json package-lock.json* ./
# Raspberry Pi gibi cihazlarda bellek sorununu önlemek için
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm install
COPY . .
RUN npm run build

# --- Production Stage ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
