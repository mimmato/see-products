#!/usr/bin/env python3
"""
Billa Weekly Brochure Scraper
Extracts product names and prices from https://ssbbilla.site/weekly
"""

import requests
from bs4 import BeautifulSoup
import json
import re
from datetime import datetime
import os

class BillaScraper:
    def __init__(self):
        self.base_url = "https://ssbbilla.site/weekly"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
    
    def fetch_page(self):
        """Fetch the weekly brochure page"""
        try:
            response = self.session.get(self.base_url)
            response.raise_for_status()
            return response.text
        except requests.RequestException as e:
            print(f"Error fetching page: {e}")
            return None
    
    def extract_products(self, html_content):
        """Extract products from the HTML content"""
        soup = BeautifulSoup(html_content, 'html.parser')
        products = []
        
        # Look for product containers with class "product"
        product_containers = soup.find_all('div', class_='product')
        
        for container in product_containers:
            try:
                # Find the actualProduct div
                product_div = container.find('div', class_='actualProduct')
                if not product_div:
                    continue
                
                # Extract product name
                product_name = self.clean_product_name(product_div.get_text(strip=True))
                
                if not product_name or len(product_name.strip()) < 3:
                    continue
                
                # Skip non-product entries (headers, footers, etc.)
                if self.is_non_product(product_name):
                    continue
                
                # Extract prices from the container
                prices = self.extract_prices_from_container(container)
                
                if prices['old_price'] is not None or prices['new_price'] is not None:
                    products.append({
                        'name': product_name,
                        'old_price': prices['old_price'],
                        'new_price': prices['new_price'],
                        'currency': 'лв.',  # Always use lev as specified
                        'discount_percent': prices.get('discount'),
                        'extracted_at': datetime.now().isoformat()
                    })
                    
            except Exception as e:
                print(f"Error processing product: {e}")
                continue
        
        return products
    
    def clean_product_name(self, text):
        """Clean and extract product name from text"""
        # Remove price information and extra spaces
        cleaned = re.sub(r'\d+\.\d+\s*(лв\.|€)', '', text)
        cleaned = re.sub(r'цена\s*-?\s*', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned if len(cleaned) > 3 else None
    
    def is_non_product(self, text):
        """Check if text represents a non-product entry"""
        non_product_patterns = [
            r'^празнувай.*billa',
            r'^\d+\s*години',
            r'^валидност:',
            r'^над\s*\d+\s*продукта',
            r'^\*.*виж повече',
            r'^\*\*.*номерацията',
            r'^мултипак оферта',
            r'www\.billa\.bg',
            r'^предстояща брошура',
            r'^седмична брошура',
            r'^обратно на училище'
        ]
        
        text_lower = text.lower()
        for pattern in non_product_patterns:
            if re.search(pattern, text_lower, re.IGNORECASE):
                return True
        return False
    
    def extract_prices_from_container(self, container):
        """Extract old and new prices from the product container"""
        prices = {'old_price': None, 'new_price': None, 'discount': None}
        
        # Look for discount percentage
        discount_div = container.find('div', class_='discount')
        if discount_div:
            discount_text = discount_div.get_text(strip=True)
            discount_match = re.search(r'-\s*(\d+)%', discount_text)
            if discount_match:
                prices['discount'] = int(discount_match.group(1))
        
        # Find the old price section (width:21%)
        old_price_div = container.find('div', style=re.compile(r'width:21%'))
        if old_price_div:
            old_price_spans = old_price_div.find_all('span', class_='price')
            if len(old_price_spans) >= 1:
                # First price in old section is the actual old price in BGN
                prices['old_price'] = float(old_price_spans[0].get_text(strip=True))
                
                # Second price in old section is actually the new price in BGN (mislabeled as EUR)
                if len(old_price_spans) >= 2:
                    prices['new_price'] = float(old_price_spans[1].get_text(strip=True))
        
        # If we didn't find new price in old section, look in new price section (width:15%)
        if prices['new_price'] is None:
            new_price_div = container.find('div', style=re.compile(r'width:15%'))
            if new_price_div:
                new_price_spans = new_price_div.find_all('span', class_='price')
                if len(new_price_spans) >= 1:
                    # First price in new section might be the new price
                    prices['new_price'] = float(new_price_spans[0].get_text(strip=True))
        
        return prices
    
    
    def save_to_json(self, products, filename=None):
        """Save products to JSON file"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"output/billa_brochure_{timestamp}.json"
        
        # Ensure output directory exists
        os.makedirs('output', exist_ok=True)
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(products, f, ensure_ascii=False, indent=2)
        
        return filename
    
    def debug_html_structure(self, html_content):
        """Debug method to inspect HTML structure"""
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Save raw HTML for inspection
        with open('debug_html.html', 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        print("HTML structure analysis:")
        print("=" * 50)
        
        # Look for common product container patterns
        patterns_to_check = [
            ('div', 'actualProduct'),
            ('div', 'product'),
            ('div', 'item'),
            ('span', 'price'),
            ('span', 'currency'),
            ('div', None),  # All divs
        ]
        
        for tag, class_name in patterns_to_check:
            if class_name:
                elements = soup.find_all(tag, class_=class_name)
                print(f"Found {len(elements)} elements with {tag}.{class_name}")
                if elements:
                    print(f"Sample: {elements[0]}")
                    print()
            else:
                # Check all divs and look for patterns
                all_divs = soup.find_all('div')
                print(f"Total divs found: {len(all_divs)}")
                
                # Look for divs with style attributes
                styled_divs = [div for div in all_divs if div.get('style')]
                print(f"Divs with style attributes: {len(styled_divs)}")
                
                if styled_divs:
                    print("Sample styled div:")
                    for div in styled_divs[:3]:
                        print(f"Style: {div.get('style')}")
                        print(f"Content: {div.get_text(strip=True)[:100]}...")
                        print()
        
        print("=" * 50)

    def scrape(self):
        """Main scraping method"""
        print("Fetching Billa weekly brochure...")
        html_content = self.fetch_page()
        
        if not html_content:
            print("Failed to fetch page content")
            return []
        
        # Debug HTML structure first
        self.debug_html_structure(html_content)
        
        print("Extracting products...")
        products = self.extract_products(html_content)
        
        if products:
            filename = self.save_to_json(products)
            print(f"Extracted {len(products)} products and saved to {filename}")
        else:
            print("No products found. The website structure might have changed.")
        
        return products

def main():
    scraper = BillaScraper()
    products = scraper.scrape()
    
    if products:
        print("\nSample products:")
        # Show products that have both old and new prices
        samples = [p for p in products if p.get('old_price') and p.get('new_price')][:5]
        if not samples:
            samples = products[:5]  # Fallback to first 5
            
        for product in samples:
            print(f"- {product['name']}")
            if product.get('old_price'):
                print(f"  Old price: {product['old_price']} {product['currency']}")
            if product.get('new_price'):
                print(f"  New price: {product['new_price']} {product['currency']}")
            if product.get('discount_percent'):
                print(f"  Discount: -{product['discount_percent']}%")
            print()

if __name__ == "__main__":
    main()