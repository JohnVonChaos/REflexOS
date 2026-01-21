from playwright.async_api import async_playwright
import asyncio
from typing import Optional, Dict, List
import json

class BrowserTools:
    def __init__(self, headless=True, timeout=30000):
        self.headless = headless
        self.timeout = timeout
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
    
    async def start(self):
        """Initialize browser"""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=self.headless,
            args=['--disable-blink-features=AutomationControlled']  # Evade detection
        )
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        self.page = await self.context.new_page()
        self.page.set_default_timeout(self.timeout)
    
    async def stop(self):
        """Clean up browser"""
        if self.page:
            await self.page.close()
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
    
    async def search_google(self, query: str) -> Dict:
        """Search Google and return results"""
        try:
            url = f"https://www.google.com/search?q={query}"
            await self.page.goto(url, wait_until="networkidle")
            
            # Wait for results
            await self.page.wait_for_selector('div#search', timeout=10000)
            
            # Extract search results
            results = await self.page.evaluate("""() => {
                const items = [];
                document.querySelectorAll('div.g').forEach(result => {
                    const title = result.querySelector('h3');
                    const link = result.querySelector('a');
                    const snippet = result.querySelector('.VwiC3b, .yXK7lf');
                    
                    if (title && link) {
                        items.push({
                            title: title.innerText,
                            url: link.href,
                            snippet: snippet ? snippet.innerText : ''
                        });
                    }
                });
                return items;
            }""")
            
            return {
                'success': True,
                'query': query,
                'results': results[:10],
                'count': len(results)
            }
        
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'query': query
            }
    
    async def navigate(self, url: str) -> Dict:
        """Navigate to URL and return page content"""
        try:
            await self.page.goto(url, wait_until="networkidle")
            
            # Get page content
            content = await self.page.content()
            title = await self.page.title()
            url_final = self.page.url
            
            # Get text content
            text = await self.page.evaluate("""() => {
                return document.body.innerText;
            }""")
            
            return {
                'success': True,
                'url': url_final,
                'title': title,
                'html': content,
                'text': text[:10000],  # Limit text size
            }
        
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'url': url
            }
    
    async def click(self, selector: str) -> Dict:
        """Click an element"""
        try:
            await self.page.click(selector)
            await self.page.wait_for_load_state("networkidle")
            
            return {
                'success': True,
                'selector': selector,
                'url': self.page.url
            }
        
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'selector': selector
            }
    
    async def fill(self, selector: str, text: str) -> Dict:
        """Fill a form field"""
        try:
            await self.page.fill(selector, text)
            
            return {
                'success': True,
                'selector': selector,
                'text': text
            }
        
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'selector': selector
            }
    
    async def screenshot(self, path: str = "screenshot.png") -> Dict:
        """Take a screenshot"""
        try:
            await self.page.screenshot(path=path, full_page=True)
            
            return {
                'success': True,
                'path': path,
                'url': self.page.url
            }
        
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'path': path
            }
    
    async def extract_links(self) -> List[str]:
        """Extract all links from current page"""
        try:
            links = await self.page.evaluate("""() => {
                return Array.from(document.querySelectorAll('a'))
                    .map(a => a.href)
                    .filter(href => href.startsWith('http'));
            }""")
            
            return links
        
        except Exception as e:
            return []
    
    async def wait_for(self, selector: str, timeout: Optional[int] = None) -> Dict:
        """Wait for an element to appear"""
        try:
            await self.page.wait_for_selector(selector, timeout=timeout or self.timeout)
            
            return {
                'success': True,
                'selector': selector
            }
        
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'selector': selector
            }


# Async context manager support
class BrowserSession:
    def __init__(self, headless=True):
        self.browser = BrowserTools(headless=headless)
    
    async def __aenter__(self):
        await self.browser.start()
        return self.browser
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.browser.stop()