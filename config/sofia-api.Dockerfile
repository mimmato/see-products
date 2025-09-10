FROM eclipse-temurin:17-jdk-jammy

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y bash curl unzip && rm -rf /var/lib/apt/lists/*

# Copy project
COPY . /app
RUN chmod +x gradlew || true

EXPOSE 8080

# Reasonable local defaults; can be overridden via docker-compose env
ENV DB_URL=jdbc:h2:mem:testdb \
    DB_USERNAME=sa \
    DB_PASSWORD=sa \
    GOOGLE_API_KEY=dummy \
    CLOUDINARY_API_SECRET=dummy

CMD ["./gradlew", "bootRun"]






