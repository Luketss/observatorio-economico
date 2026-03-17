# --------- STAGE 1: Build ---------
FROM node:20-alpine AS builder

WORKDIR /app

# Copia arquivos de dependência
COPY package.json package-lock.json ./

# Instala dependências
RUN npm install

# Copia o restante do projeto
COPY . .

# Build do Vite
RUN npm run build

# --------- STAGE 2: Nginx ---------
FROM nginx:stable-alpine

# Remove config padrão
RUN rm -rf /usr/share/nginx/html/*

# Copia build gerado
COPY --from=builder /app/dist /usr/share/nginx/html

# Configuração para SPA (fallback para index.html)
RUN echo 'server { \
  listen 80; \
  server_name _; \
  root /usr/share/nginx/html; \
  index index.html; \
  location / { \
    try_files $uri $uri/ /index.html; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
