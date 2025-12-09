
import os
from playwright.sync_api import sync_playwright, expect

def test_app_load(page):
    # 1. Arrange: Go to the app
    # Using localhost:5000 as it's the default vite port
    page.goto("http://localhost:5000")

    # 2. Act: Wait for the main elements to load
    # Look for the title "Assignment Real Generator"
    page.wait_for_selector("text=Assignment Real Generator")

    # Check for the prompt textarea
    page.wait_for_selector("textarea[placeholder*='Describe the handwriting style']")

    # Check for the upload area
    page.wait_for_selector("text=Click or Drag PDF / Image here")

    # 3. Assert: Verify the prompt is empty initially
    prompt_area = page.locator("textarea")
    expect(prompt_area).to_be_empty()

    # 4. Screenshot
    page.screenshot(path="/home/jules/verification/upload_screen.png")
    print("Screenshot saved to /home/jules/verification/upload_screen.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_app_load(page)
        except Exception as e:
            print(f"Test failed: {e}")
            # Take screenshot even on failure if possible
            try:
                page.screenshot(path="/home/jules/verification/failure.png")
            except:
                pass
        finally:
            browser.close()
