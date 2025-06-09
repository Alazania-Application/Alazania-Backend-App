# ------------ BUILD STAGE ------------
FROM node:20-alpine AS build

WORKDIR /app

# Required for building native dependencies (if any)
# RUN apk add --no-cache python3 make g++

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile 

# Copy source files and build
COPY . .
RUN yarn build

# ------------ RUNTIME STAGE ------------
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy only necessary files from build stage
COPY --from=build /app/package.json ./
COPY --from=build /app/yarn.lock ./
COPY --from=build /app/dist ./dist

# Install only production dependencies
RUN yarn install --frozen-lockfile

# Use non-root user (optional but more secure)
# RUN addgroup -S appgroup && adduser -S appuser -G appgroup
# USER appuser

EXPOSE 8088

# Run the built app directly
CMD ["node", "dist/app.js"]
