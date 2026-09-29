FROM python:3.11-slim
WORKDIR /app
COPY benchmark_server.py .
EXPOSE 8080
CMD ["python3", "-u", "benchmark_server.py"]
