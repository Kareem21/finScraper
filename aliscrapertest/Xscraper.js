import { Scraper, SearchMode } from "agent-twitter-client";
import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";

// Supabase configuration
const SUPABASE_URL = "https://ekqpaxwmblelcxbfxdun.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrcXBheHdtYmxlbGN4YmZ4ZHVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU2NTM5NzQsImV4cCI6MjA1MTIyOTk3NH0.aBxxX8gyeKAF3Filj4_k3Cf8mUS9retqPIGftIWf_hs";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Twitter credentials
const TWITTER_USERNAME = "ericmelbie94366"; // Replace with your actual username
const TWITTER_PASSWORD = "Halorocks9156!"; // Replace with your actual password
const TWITTER_EMAIL = "ericmelbieman@gmail.com"; // Replace with your actual email

// Path to save cookies
const COOKIE_PATH = path.resolve("./twitter_cookies.json");

// Initialize the scraper
async function initScraper() {
  const scraper = new Scraper();

  try {
    // Load cached cookies if available
    const cachedCookies = await fs.readFile(COOKIE_PATH, "utf8").catch(() => null);

    if (cachedCookies) {
      console.log("Using cached cookies...");
      const parsedCookies = JSON.parse(cachedCookies);

      // Validate that the cookies are in the correct format
      if (Array.isArray(parsedCookies) && parsedCookies.every(cookie => cookie.key && cookie.value)) {
        await scraper.setCookies(parsedCookies);
      } else {
        throw new Error("Invalid cookie format. Regenerating cookies...");
      }
    } else {
      throw new Error("No cached cookies found. Logging in...");
    }
  } catch (error) {
    console.error(error.message);

    // Perform a fresh login if cookies are missing or invalid
    console.log("Logging in and caching cookies...");
    await scraper.login(TWITTER_USERNAME, TWITTER_PASSWORD, TWITTER_EMAIL);
    const cookies = await scraper.getCookies();
    await fs.writeFile(COOKIE_PATH, JSON.stringify(cookies));
  }

  return scraper;
}

// Insert trending topics into Supabase
async function insertTrendingTopics(topics) {
  const data = topics.map((topic) => ({
    trend_name: topic,
    scraped_at: new Date().toISOString(),
  }));

  try {
    const response = await supabase.from("trending_topics").insert(data).select();
    console.log("Inserted trending topics into Supabase:", response);
  } catch (error) {
    console.error("Error inserting trending topics into Supabase:", error);
  }
}

// Scrape trending topics
async function scrapeTrendingTopics(scraper) {
  console.log("Fetching trending topics...");
  try {
    const trends = await scraper.getTrends();
    console.log("Trending Topics:", trends);

    // Insert all trending topics into Supabase
    await insertTrendingTopics(trends);

    return trends;
  } catch (error) {
    console.error("Error fetching trending topics:", error);
    return [];
  }
}

// Insert tweets into Supabase
async function insertTweets(tweets) {
  const data = tweets.map((tweet) => ({
    tweet_id: tweet.id,
    content: tweet.text,
    username: tweet.user?.username || "unknown",
    tickers: extractTickers(tweet.text),
    hashtags: tweet.entities?.hashtags?.map((h) => h.tag) || [],
    mentions: tweet.entities?.mentions?.map((m) => m.username) || [],
    created_at: tweet.created_at || new Date().toISOString(),
    query: tweet.query || null
  }));

  try {
    const response = await supabase.from("fintweets").insert(data).select();
    console.log("Inserted tweets into Supabase:", response);
  } catch (error) {
    console.error("Error inserting tweets:", error);
  }
}

// Extract stock tickers from tweet content
function extractTickers(text) {
  const matches = text.match(/\$[A-Z]{1,5}/g); // Match tickers like $TSLA, $AAPL
  return matches ? matches.map((ticker) => ticker.replace("$", "")) : [];
}

// Introduce a randomized delay between queries
async function randomDelay(min = 5000, max = 15000) {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  console.log(`Delaying for ${delay}ms...`);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// Scrape tweets by a specific query
async function scrapeTweets(scraper, query, maxTweets) {
  console.log(`Scraping tweets for query: ${query}`);
  const tweets = [];

  try {
    for await (const tweet of scraper.searchTweets(query, maxTweets, SearchMode.Latest)) {
      tweet.query = query; // Add query for context
      tweets.push(tweet);

      // Insert every 20 tweets
      if (tweets.length % 20 === 0) {
        await insertTweets(tweets);
        tweets.length = 0; // Clear the array after insertion
        await randomDelay(); // Introduce delay after every batch
      }
    }

    // Insert any remaining tweets
    if (tweets.length > 0) {
      await insertTweets(tweets);
    }
  } catch (error) {
    console.error(`Error scraping tweets for query: ${query}`, error);
  }

  // Final delay to avoid detection
  await randomDelay();
}

// Scrape tweets by username
async function scrapeByUsername(scraper, username, maxTweets) {
  console.log(`Scraping tweets from username: ${username}`);
  const query = `from:${username}`;
  await scrapeTweets(scraper, query, maxTweets);
}

// Main function
async function main() {
  const scraper = await initScraper();

  // Fetch and process trending topics
  await scrapeTrendingTopics(scraper);

  // Define queries based on the ticker with their respective max tweets
  const TICKER = "TSLA"; // Example stock ticker
  const queries = [
    { query: `#${TICKER}`, maxTweets: 5000 }, // Hashtag format
    { query: `$${TICKER}`, maxTweets: 5000 }, // Ticker format in content
    { query: `${TICKER}`, maxTweets: 5000 }, // General mentions of the ticker
    { query: `${TICKER} options`, maxTweets: 2500 }, // Keywords related to options
    { query: `${TICKER} 0DTE`, maxTweets: 2500 }, // Keywords related to 0DTE
    { query: `${TICKER} news`, maxTweets: 2500 } // Keywords for news
  ];

  // Scrape tweets for each query
  for (const { query, maxTweets } of queries) {
    await scrapeTweets(scraper, query, maxTweets);
  }

  // Example: Scrape tweets from a specific username
  const username = "elonmusk"; // Replace with desired username
  await scrapeByUsername(scraper, username, 1000);

  console.log("Scraping completed.");
}

// Run the main function
main().catch((error) => console.error("Error in main:", error));
