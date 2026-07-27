#!/usr/bin/env python3
"""
Student Note & Large Data Summarizer (CLI Automation)
Summarizes large notes, text files, and documents into concise 2 or 3 paragraph summaries.
Requires Python 3.6+ (No external dependencies required).
"""

import sys
import os
import re
import math
import argparse
from collections import Counter

STOP_WORDS = set([
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
    "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
    "below", "between", "both", "but", "by", "can", "can't", "cannot", "could",
    "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down",
    "during", "each", "few", "for", "from", "further", "had", "hadn't", "has",
    "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her",
    "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's",
    "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it",
    "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
    "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other",
    "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shan't",
    "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such",
    "than", "that", "that's", "the", "their", "theirs", "them", "themselves",
    "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
    "they've", "this", "those", "through", "to", "too", "under", "until", "up",
    "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were",
    "weren't", "what", "what's", "when", "when's", "where", "where's", "which",
    "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would",
    "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
    "yourself", "yourselves", "also", "thus", "hence", "therefore", "however"
])

def clean_word(word):
    return re.sub(r'[^a-zA-Z0-9]', '', word).lower()

def split_into_sentences(text):
    # Regex to split sentences by ., !, ? followed by whitespace or quote
    sentence_endings = re.compile(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!)\s+')
    raw_sentences = sentence_endings.split(text.strip())
    sentences = []
    for s in raw_sentences:
        s_clean = s.strip()
        if len(s_clean) > 10:
            sentences.append(s_clean)
    return sentences

def score_sentences(sentences):
    words_list = []
    sentence_words = []
    
    for s in sentences:
        words = [clean_word(w) for w in re.split(r'\s+', s)]
        words = [w for w in words if w and w not in STOP_WORDS and len(w) > 2]
        words_list.extend(words)
        sentence_words.append(words)

    if not words_list:
        return {idx: 1.0 for idx in range(len(sentences))}

    word_freq = Counter(words_list)
    max_freq = max(word_freq.values()) if word_freq else 1

    # Sentence scoring based on word weights, position boost, and length normalization
    scores = {}
    total_sentences = len(sentences)

    for idx, (sentence, words) in enumerate(zip(sentences, sentence_words)):
        if not words:
            scores[idx] = 0.0
            continue
        
        # Word frequency score
        raw_score = sum(word_freq[w] / max_freq for w in words)
        
        # Length penalty/boost (penalize extremely short or excessively long sentences)
        length_multiplier = 1.0
        word_count = len(re.split(r'\s+', sentence))
        if word_count < 7:
            length_multiplier = 0.6
        elif word_count > 45:
            length_multiplier = 0.8
        
        # Position boost (first 15% and last 10% of text usually contain core concepts)
        position_multiplier = 1.0
        relative_pos = idx / total_sentences
        if relative_pos <= 0.15:
            position_multiplier = 1.35
        elif relative_pos >= 0.85:
            position_multiplier = 1.2
            
        final_score = (raw_score / len(words)) * length_multiplier * position_multiplier
        scores[idx] = final_score

    return scores

def summarize_text(text, target_paragraphs=3):
    """
    Summarizes arbitrary text into target_paragraphs (default 2 or 3).
    """
    text = re.sub(r'\s+', ' ', text).strip()
    if not text:
        return "No text provided for summarization.", []

    sentences = split_into_sentences(text)
    if len(sentences) <= 3:
        # Text is already very short
        return text, sentences

    scores = score_sentences(sentences)
    
    # Determine total sentences needed (approx 3-5 sentences per paragraph)
    target_sentence_count = max(target_paragraphs * 3, min(len(sentences), target_paragraphs * 4))
    
    # Pick top scoring sentences
    ranked_indices = sorted(scores.keys(), key=lambda i: scores[i], reverse=True)
    selected_indices = sorted(ranked_indices[:target_sentence_count])
    
    selected_sentences = [sentences[i] for i in selected_indices]
    
    # Divide selected sentences smoothly into target_paragraphs (e.g. 2 or 3)
    chunk_size = math.ceil(len(selected_sentences) / target_paragraphs)
    paragraphs = []
    
    for i in range(0, len(selected_sentences), chunk_size):
        chunk = selected_sentences[i:i + chunk_size]
        if chunk:
            paragraphs.append(" ".join(chunk))
            
    summary_text = "\n\n".join(paragraphs[:target_paragraphs])
    
    # Extract top key bullet points (5 key takeaways)
    top_bullet_indices = sorted(ranked_indices[:min(5, len(sentences))])
    bullet_points = [sentences[i] for i in top_bullet_indices]

    return summary_text, bullet_points

def process_file(file_path, target_paragraphs=3):
    if not os.path.exists(file_path):
        print(f"Error: File '{file_path}' not found.")
        return

    print(f"\n📄 Processing: {os.path.basename(file_path)}")
    print("-" * 50)
    
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    original_words = len(content.split())
    summary, bullets = summarize_text(content, target_paragraphs=target_paragraphs)
    summary_words = len(summary.split())
    reduction = 100 - round((summary_words / max(original_words, 1)) * 100)

    print(f"📊 Original Words: {original_words} | Summary Words: {summary_words} | Reduced by: {reduction}%")
    print(f"\n✨ {target_paragraphs}-PARAGRAPH SUMMARY:")
    print("=" * 50)
    print(summary)
    print("=" * 50)

    print("\n📌 KEY TAKEAWAYS:")
    for idx, bullet in enumerate(bullets, 1):
        print(f"  {idx}. {bullet}")
    print()

    # Save output to a summary file
    out_path = file_path + ".summary.txt"
    with open(out_path, 'w', encoding='utf-8') as out_file:
        out_file.write(f"SUMMARY FOR: {os.path.basename(file_path)}\n")
        out_file.write(f"Stats: {original_words} words -> {summary_words} words ({reduction}% compression)\n\n")
        out_file.write(f"--- {target_paragraphs}-PARAGRAPH SUMMARY ---\n\n")
        out_file.write(summary + "\n\n")
        out_file.write("--- KEY TAKEAWAYS ---\n\n")
        for idx, b in enumerate(bullets, 1):
            out_file.write(f"{idx}. {b}\n")
            
    print(f"💾 Saved summary to: {out_path}")

def batch_process(folder_path, target_paragraphs=3):
    if not os.path.isdir(folder_path):
        print(f"Error: Directory '{folder_path}' not found.")
        return

    valid_exts = ('.txt', '.md', '.log', '.doc')
    files = [os.path.join(folder_path, f) for f in os.listdir(folder_path) if f.lower().endswith(valid_exts)]
    
    if not files:
        print(f"No processable text files found in '{folder_path}'. Supported extensions: {valid_exts}")
        return

    print(f"🚀 Found {len(files)} text documents in '{folder_path}'. Starting batch summarization...")
    for f in files:
        process_file(f, target_paragraphs=target_paragraphs)

def main():
    parser = argparse.ArgumentParser(description="Student Note & Data Summarizer Automation Tool")
    parser.add_argument("-i", "--input", help="Path to input text file")
    parser.add_argument("-b", "--batch", help="Path to directory for batch processing files")
    parser.add_argument("-p", "--paragraphs", type=int, default=3, choices=[2, 3, 4], help="Target summary paragraph count (2 or 3 standard, default: 3)")
    parser.add_argument("-t", "--text", help="Direct raw text string to summarize")

    args = parser.parse_args()

    if args.input:
        process_file(args.input, target_paragraphs=args.paragraphs)
    elif args.batch:
        batch_process(args.batch, target_paragraphs=args.paragraphs)
    elif args.text:
        summary, bullets = summarize_text(args.text, target_paragraphs=args.paragraphs)
        print(f"\n✨ {args.paragraphs}-PARAGRAPH SUMMARY:\n")
        print(summary)
        print("\n📌 KEY TAKEAWAYS:")
        for idx, b in enumerate(bullets, 1):
            print(f"  {idx}. {b}")
    else:
        # Interactive mode if no CLI args passed
        print("==================================================")
        print(" 🎓 Student Notes & Data Summarizer Automation 🎓")
        print("==================================================")
        print("Summarizes long texts into concise 2 or 3 paragraph summaries.\n")
        print("Options:")
        print("  1. Summarize a single text file")
        print("  2. Batch summarize a directory of files")
        print("  3. Paste raw text to summarize")
        print("  4. Exit")
        
        choice = input("\nEnter choice (1-4): ").strip()
        if choice == '1':
            filepath = input("Enter file path: ").strip().strip('"\'')
            paras = input("Number of paragraphs (2 or 3) [default: 3]: ").strip()
            paras_val = int(paras) if paras in ['2', '3'] else 3
            process_file(filepath, target_paragraphs=paras_val)
        elif choice == '2':
            dirpath = input("Enter directory path: ").strip().strip('"\'')
            paras = input("Number of paragraphs (2 or 3) [default: 3]: ").strip()
            paras_val = int(paras) if paras in ['2', '3'] else 3
            batch_process(dirpath, target_paragraphs=paras_val)
        elif choice == '3':
            print("Paste your text below (press Ctrl+Z and Enter or Ctrl+D when finished):")
            try:
                raw_input_lines = sys.stdin.read()
                paras = input("\nNumber of paragraphs (2 or 3) [default: 3]: ").strip()
                paras_val = int(paras) if paras in ['2', '3'] else 3
                summary, bullets = summarize_text(raw_input_lines, target_paragraphs=paras_val)
                print(f"\n✨ {paras_val}-PARAGRAPH SUMMARY:\n\n{summary}")
                print("\n📌 KEY TAKEAWAYS:")
                for idx, b in enumerate(bullets, 1):
                    print(f"  {idx}. {b}")
            except Exception as e:
                print(f"Error reading input: {e}")
        else:
            print("Exiting summarizer.")

if __name__ == "__main__":
    main()
