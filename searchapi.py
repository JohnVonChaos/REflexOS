import logging
import re
from fastapi import FastAPI
from pydantic import BaseModel
import requests
from fastapi.middleware.cors import CORSMiddleware


# --- Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchQuery(BaseModel):
    query: str


# Replace with your Brave Search API key
BRAVE_API_KEY = "BRAVEAPIKEYHERE"


# --- Helper Functions ---


def extract_search_phrase(raw_query):
    """Extracts the core search intent from the raw input."""
    # Priority 1: Look for explicit SEARCH QUERY: label
    match = re.search(r'SEARCH QUERY:\s*([^\n]+)', raw_query, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    
    # Priority 2: Look for ? search.brave command (explicit search command)
    match = re.search(r'\?\s*search\.brave\s+(.+?)(?:\n|$|```)', raw_query, re.IGNORECASE | re.MULTILINE)
    if match:
        return match.group(1).strip()
    
    # Priority 3: Look for search.brave without the ? prefix
    match = re.search(r'search\.brave\s+(.+?)(?:\n|$|```)', raw_query, re.IGNORECASE | re.MULTILINE)
    if match:
        return match.group(1).strip()
    
    # Fallback: Get the last non-empty, non-formatting line
    # Remove code blocks and formatting noise
    cleaned = re.sub(r'```.*?```', '', raw_query, flags=re.DOTALL)
    lines = [l.strip() for l in cleaned.splitlines() if l.strip() and not l.strip().startswith('#') and not l.strip().startswith('*')]
    return lines[-1] if lines else ""


def result_is_relevant(result, query):
    """
    Filters out results where the title/snippet does not contain 
    significant words from the query.
    """
    query_words = [w.lower() for w in re.split(r'\W+', query) if len(w) > 3]
    
    if not query_words:
        return True

    title = result.get("title", "").lower()
    snippet = result.get("snippet", result.get("description", "")).lower()
    
    match_found = any(word in title or word in snippet for word in query_words)
    return match_found


def normalize_brave_results(raw_results):
    """
    Normalizes Brave API response structure into standard format.
    """
    normalized = []
    for res in raw_results:
        title = res.get("title", "")
        url = res.get("url", "")
        snippet = res.get("description", "")
        
        if title and url:
            normalized.append({
                "title": title,
                "url": url,
                "snippet": snippet,
                "source": "brave"
            })
    return normalized


# --- API Wrapper Functions ---


def brave_search(query: str, num_results: int = 25):
    """
    Performs search using Brave Search API.
    """
    logger.info(f"Performing Brave search for: '{query}'")
    url = "https://api.search.brave.com/res/v1/web/search"
    
    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": BRAVE_API_KEY,
        "Cache-Control": "no-cache"
    }
    
    params = {
        "q": query,
        "count": 10
    }
    
    try:
        logger.info(f"Making HTTP GET to {url} with query: {query}")
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        logger.info(f"Brave API response status: {resp.status_code}")
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"Brave API returned JSON with keys: {list(data.keys())}")
        
        # Brave returns results in 'web' -> 'results'
        web_results = data.get('web', {}).get('results', [])
        logger.info(f"Extracted {len(web_results)} web results from Brave response")
        return normalize_brave_results(web_results)
        
    except Exception as e:
        logger.error(f"Brave Search API error: {type(e).__name__}: {e}")
        logger.error(f"API Key used: {BRAVE_API_KEY[:10]}... (first 10 chars)")
        return []


# --- Main Endpoint ---


@app.post("/websearch")
async def websearch_endpoint(data: SearchQuery):
    logger.info(f"Received request. Raw Query: '{data.query}'")
    main_query = extract_search_phrase(data.query)
    logger.info(f"Extracted Query: '{main_query}'")

    # If we couldn't extract a usable query, avoid hitting Brave with an empty q= and
    # provide a clear response that the caller should send an explicit query.
    if not main_query or not main_query.strip():
        logger.warning("Extracted query is empty; skipping Brave request.")
        return {
            "text": "No search query could be extracted from the request.\n" +
                    "Please send a direct query like `? search.brave ping lookup diagnostics`.",
            "results": []
        }

    # Perform Brave search
    raw_results = brave_search(main_query)
    
    # Apply Relevance Filtering
    filtered_results = [res for res in raw_results if result_is_relevant(res, main_query)]
    
    logger.info(f"Brave returned {len(raw_results)} raw, {len(filtered_results)} relevant.")

    # Fallback: If filters removed everything, keep top 2 raw results
    if not filtered_results and raw_results:
        logger.warning("All filters failed. Returning top 2 raw results as fallback.")
        filtered_results = raw_results[:2]

    # Format Final Output
    enriched_results = []
    for res in filtered_results:
        enriched_data = {
            "title": res["title"],
            "url": res["url"],
            "snippet": res["snippet"],
            "page_content": res["snippet"]
        }
        enriched_results.append(enriched_data)

    # Create a text summary for LLM consumption
    summary = "\n\n".join([
        f"Title: {r['title']}\nURL: {r['url']}\nSnippet: {r['snippet']}"
        for r in enriched_results
    ])
    
    if not summary:
        summary = "No relevant search results found."

    logger.info(f"Returning {len(enriched_results)} items.")
    return {"text": summary, "results": enriched_results}


# Run: uvicorn yourfilename:app --host 0.0.0.0 --port 8000 --reload
