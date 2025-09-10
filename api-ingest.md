# Supermarket Price Comparison Project

## Project Overview
Build a full-stack application that collects supermarket product data from an existing API, stores it in a database, and provides a frontend interface for users to compare prices across different supermarkets.

## API Integration
- **Source API**: `http://localhost:8080/swagger-ui/index.html#/Product/products`
- **Setup**: Already integrated into Docker setup and included in the project
- **Data Source**: API pulls data from different supermarkets
- **Goal**: Collect and visualize the data on the frontend

## Database Schema Requirements

### Product Entry Logic
Each unique product entry is identified by the combination of:
1. **Supermarket name** (e.g., "Lidl")
2. **Product name** (e.g., "Мини моцарела")
3. **Quantity** (e.g., "125 g/опаковка")

### Data Structure Example
```json
{
  "supermarket": "Lidl",
  "products": [
    {
      "name": "Мини моцарела",
      "quantity": "125 g/опаковка",
      "price": 2.69,
      "oldPrice": 3.69
    }
  ]
}
```

### Database Fields
For each product entry, store:
- `supermarket` (string): Name of the supermarket
- `name` (string): Product name
- `quantity` (string): Product quantity/package size
- `price` (decimal): Current price
- `oldPrice` (decimal): Previous price
- `timestamp` (datetime): When the data was collected
- `id` (primary key): Unique identifier

## Backend Requirements

### Data Collection Service
1. **API Polling**: Regularly fetch data from the products API
2. **Data Processing**: Parse JSON response and extract product information
3. **Duplicate Prevention**: Check if a product entry already exists based on the unique combination (supermarket + name + quantity)
4. **Database Updates**: 
   - Insert new products when found
   - Update existing products with new price information
   - Maintain price history

### Database Operations
- Create tables for products and price history
- Implement CRUD operations
- Handle concurrent data updates
- Ensure data integrity with proper indexing

### REST API Endpoints
Create endpoints for the frontend:
- `GET /api/products` - Get all products
- `GET /api/products/search?name={productName}` - Search products by name
- `GET /api/products/{id}/history` - Get price history for a product
- `GET /api/supermarkets` - Get list of all supermarkets

## Frontend Requirements

### Product Selection Interface
1. **Search Functionality**: Allow users to search and select products
2. **Product List**: Display available products with their variations (quantities)
3. **Filter Options**: Filter by supermarket, price range, etc.

### Price Comparison Display
When a user selects a product (e.g., "Мини моцарела (125 g/опаковка)"):

#### Layout Structure
```
Product: Мини моцарела (125 g/опаковка)

┌─────────────────────────────────────┐
│ Lidl                                │
│ Current Price: 2.69 лв              │
│ Old Price: 3.69 лв                  │
│ Price Drop: -1.00 лв (-27.1%)       │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Kaufland                            │
│ Current Price: 2.89 лв              │
│ Old Price: 3.49 лв                  │
│ Price Drop: -0.60 лв (-17.2%)       │
└─────────────────────────────────────┘
```

#### Display Features
- **Supermarket Columns**: Each supermarket gets its own column/card
- **Current Price**: Prominently displayed current price
- **Old Price**: Show previous price (crossed out or grayed)
- **Price Change**: Calculate and show the difference
- **Visual Indicators**: Green for price drops, red for price increases
- **Availability**: Show "Not Available" if product isn't sold at a supermarket

### Additional Frontend Features
1. **Price History Charts**: Show price trends over time
2. **Best Deal Highlighting**: Highlight the cheapest current price
3. **Favorites**: Allow users to save favorite products for quick access
4. **Notifications**: Alert users when prices drop on their favorite products

## Technical Implementation

### Technology Stack Suggestions
- **Backend**: Node.js/Express, Python/FastAPI, or Java/Spring Boot
- **Database**: PostgreSQL or MySQL
- **Frontend**: React, Vue.js, or Angular
- **Styling**: Tailwind CSS or Material-UI
- **Charts**: Chart.js or D3.js for price history visualization

### Docker Integration
- Ensure the application works within the existing Docker setup
- Create proper Docker compose configuration
- Handle database initialization and migrations

### Data Synchronization
1. **Scheduled Jobs**: Set up cron jobs or scheduled tasks to fetch API data
2. **Real-time Updates**: Consider WebSocket connections for live price updates
3. **Error Handling**: Robust error handling for API failures
4. **Logging**: Comprehensive logging for debugging and monitoring

## Implementation Steps

### Phase 1: Backend Setup
1. Set up database schema and migrations
2. Create data collection service to fetch from the API
3. Implement product deduplication logic
4. Create REST API endpoints

### Phase 2: Data Processing
1. Parse JSON data from the supermarket API
2. Implement unique product identification logic
3. Set up automated data collection (cron jobs)
4. Test data integrity and duplicate handling

### Phase 3: Frontend Development
1. Create product search and selection interface
2. Build price comparison display components
3. Implement responsive design for mobile devices
4. Add price history visualization

### Phase 4: Integration & Testing
1. Connect frontend to backend APIs
2. Test the complete data flow
3. Performance optimization
4. User acceptance testing

## Success Criteria
- [ ] API data is successfully collected and stored
- [ ] No duplicate entries for identical products
- [ ] Users can easily search and select products
- [ ] Price comparisons are clearly displayed by supermarket
- [ ] Price history is tracked and visualizable
- [ ] Application is responsive and user-friendly
- [ ] Data updates automatically from the API

## Notes
- Handle Cyrillic text properly (Bulgarian product names)
- Consider currency formatting (лв for Bulgarian Lev)
- Implement proper error handling for API downtime
- Plan for scalability as more supermarkets are added
- Consider caching strategies for better performance