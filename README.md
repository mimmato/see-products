# 🛒 Bulgarian Price Tracker

A comprehensive price comparison platform for Bulgarian supermarkets (Kaufland, Billa, Lidl, Fantastico) with automated data collection and historical price tracking.

![Price Tracker Preview](https://img.shields.io/badge/Status-Active-green) ![Docker](https://img.shields.io/badge/Docker-Ready-blue) ![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Features

- 🔄 **Automated Price Collection** - Daily scraping from major Bulgarian supermarkets
- 📊 **Historical Price Tracking** - Complete price history with TimescaleDB
- 🖥️ **Beautiful Web Interface** - Responsive design with real-time price comparisons
- 📱 **Mobile Friendly** - Works perfectly on phones and tablets
- 🎯 **Smart Search** - Find products across all stores instantly
- 📈 **Price Charts** - Visual price trends over time
- 🚀 **Public Hosting Ready** - Includes Cloudflare Tunnel for easy deployment
- 📄 **PDF Brochure Processing** - OCR extraction from promotional brochures

## 🏪 Supported Stores

- **Kaufland** - Website scraping + API integration
- **Billa** - Website scraping + PDF brochure processing  
- **Lidl** - Website scraping
- **Fantastico** - Website scraping + Flippingbook brochure processing

## 🚀 Quick Start

### Prerequisites
- Docker Desktop
- 4GB+ free disk space
- Internet connection

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/price-tracker-bg.git
   cd price-tracker-bg
   ```

2. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your passwords
   ```

3. **Start the application**
   ```bash
   docker-compose up -d
   ```

4. **Access the website**
   - Frontend: http://localhost
   - API: http://localhost:3001
   - n8n Automation: http://localhost:5678

### Sample .env Configuration

```env
# Database Configuration
DB_NAME=prices
DB_USER=priceuser
DB_PASSWORD=SecurePassword123!

# Application Configuration
TIMEZONE=Europe/Sofia
API_PORT=3001
FRONTEND_PORT=80

# n8n Configuration
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=AdminPassword123!

# Project Name
COMPOSE_PROJECT_NAME=price-tracker
```

## 🌐 Public Hosting

### Free Option: Cloudflare Tunnel

1. **Start your local application**
   ```bash
   docker-compose up -d
   ```

2. **Run the tunnel**
   ```bash
   # Windows
   start-tunnel.bat
   
   # Linux/Mac
   ./cloudflared tunnel --url http://localhost:80
   ```

3. **Get your public URL** - The tunnel will provide a `https://xxx.trycloudflare.com` URL

### Production Deployment

Deploy to cloud platforms:
- **Railway.app** (Recommended)
- **DigitalOcean Droplets**
- **AWS EC2**
- **Render.com**

## 📊 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Server    │    │  TimescaleDB    │
│   (Nginx)       │───▶│   (Node.js)     │───▶│   (PostgreSQL)  │
│   Port 80       │    │   Port 3001     │    │   Port 5432     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │
         │              ┌─────────────────┐
         │              │       n8n       │
         └──────────────│   (Automation)  │
                        │   Port 5678     │
                        └─────────────────┘
```

## 🔄 Data Collection

### Automated Collection (Daily at 3:15 AM)
- **Website Scraping** - Direct product data extraction
- **API Integration** - Sofia municipality supermarket API
- **PDF Brochure Processing** - OCR extraction from promotional materials

### Manual Collection
```bash
# Collect from all sources
npm run collect:all

# Collect from specific store
npm run collect:billa
npm run collect:fantastico

# Process brochures only
npm run collect:brochures
```

## 🗄️ Database Schema

### Main Tables
- **`price_data`** - All price records with timestamps (TimescaleDB hypertable)
- **`latest_prices`** - View of most recent prices per product/store
- **`daily_average_prices`** - Materialized view of daily price averages

### Key Features
- **Time-series optimization** with TimescaleDB
- **Automatic partitioning** by time
- **Historical data preservation** - all prices kept forever
- **Fast queries** with optimized indexes

## 🛠️ Development

### Project Structure
```
price-tracker-bg/
├── api-server/           # Node.js API backend
│   ├── utils/           # Database, parsing utilities
│   ├── collect-*.js     # Data collection scripts
│   └── server.js        # Main API server
├── frontend/            # HTML/CSS/JS website
├── config/              # Database init scripts
├── docker-compose.yml   # Container orchestration
└── CLAUDE.md           # Detailed implementation guide
```

### API Endpoints

```bash
# Product search and prices
GET /api/products                    # List all products
GET /api/search/suggestions?q=хляб   # Search suggestions
GET /api/prices/latest?product=хляб  # Latest prices
GET /api/prices/history?product=хляб&days=30  # Price history
GET /api/prices/compare?product=хляб  # Price comparison

# Store information
GET /api/stores                      # List all stores
GET /api/stores/Billa/discounts     # Store discounts

# Statistics
GET /api/statistics?product=хляб     # Product statistics
```

### Adding New Stores

1. **Create collector script** in `api-server/collect-newstore.js`
2. **Update database** with store-specific logic
3. **Add to cron job** in `server.js`
4. **Update frontend** store badges and colors

## 🧪 Testing

```bash
# Test database connection
npm run test:db

# Test individual collectors
npm run test:billa
npm run test:fantastico

# Test brochure processing
npm run test:brochures
```

## 📈 Monitoring

- **Health endpoint**: `GET /api/health`
- **Database metrics**: Built-in TimescaleDB monitoring
- **Collection logs**: Check Docker logs
- **n8n workflows**: Visual automation monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **TimescaleDB** for excellent time-series database
- **Tesseract.js** for OCR processing
- **Docker** for containerization
- **Cloudflare** for free tunneling service

## 📞 Support

- **Documentation**: See `CLAUDE.md` for detailed setup guide
- **Issues**: Report bugs via GitHub Issues
- **Discussions**: Use GitHub Discussions for questions

---

**Made with ❤️ for the Bulgarian community**

*Help Bulgarian families save money by comparing prices across major supermarkets.*