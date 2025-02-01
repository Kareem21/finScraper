import praw
import re
import time
import os
from datetime import datetime, timedelta
from supabase import create_client, Client

# Supabase connection
url = 'https://ekqpaxwmblelcxbfxdun.supabase.co'
key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrcXBheHdtYmxlbGN4YmZ4ZHVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU2NTM5NzQsImV4cCI6MjA1MTIyOTk3NH0.aBxxX8gyeKAF3Filj4_k3Cf8mUS9retqPIGftIWf_hs'
supabase: Client = create_client(url, key)

reddit = praw.Reddit(
    client_id="MaukzTN64kewLh66_RNIAw",
    client_secret="8JlS1SlFRft4xhShcFI-WI3-Xz2sMw",
    user_agent="RedditScraper (by /u/Impressive_Safety_26"
)

def extract_tickers(title):
    return re.findall(r'\b[A-Z]{1,5}\b', title)

def insert_post(post_data):
    try:
        supabase.table("redditscraper").upsert(post_data, on_conflict="post_id").execute()
    except Exception as e:
        print(f"Error inserting post: {e}")

def scrape_and_store():
    subreddit = reddit.subreddit("wallstreetbets")
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=7)
    
    for submission in subreddit.new(limit=1000):
        post_date = datetime.fromtimestamp(submission.created_utc)
        if post_date < start_date:
            break
        
        post_data = {
            'post_id': submission.id,
            'post_title': submission.title,
            'post_timestamp': post_date.isoformat(),
            'tickers': extract_tickers(submission.title),
            'comment_count': submission.num_comments,
            'upvote_ratio': submission.upvote_ratio,
            'score': submission.score,
            'flair': submission.link_flair_text
        }
        insert_post(post_data)

if __name__ == "__main__":
    scrape_and_store()