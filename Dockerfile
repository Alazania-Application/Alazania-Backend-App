
# Use lightweight Node 18 Alpine as the base image
FROM node:22-alpine AS build

# Set working directory
WORKDIR /usr/src/app

# Install dependencies required for building native modules
RUN apk add --no-cache python3 make g++

# Copy package files first for better caching
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile --legacy-peer-deps

# Copy application files
COPY . .

# Build the application
RUN yarn build

# ------------------------ FINAL IMAGE ------------------------

FROM node:20-alpine AS runtime

# Set working directory
WORKDIR /usr/src/app

# Copy only required files from build stage
COPY --from=build /usr/src/app/package.json ./
COPY --from=build /usr/src/app/yarn.lock ./
COPY --from=build /usr/src/app/dist ./dist


# Install only production dependencies
RUN yarn install --frozen-lockfile


# Expose application port
EXPOSE 8088

# Start the application
CMD ["yarn", "start"]
