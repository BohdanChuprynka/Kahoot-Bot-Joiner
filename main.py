# Main script 

from selenium import webdriver
from selenium.webdriver.common.keys import Keys 
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from concurrent.futures import ThreadPoolExecutor

import time

# Constants
KAHOOT_URL = "https://kahoot.it/"
GAME_CODE = input("Enter game code: ")
BASE_NAME = input("Enter desired name: ")
JOIN_COUNT = int(input("Number of total bots: ")) 

def join_kahoot(driver, url, game_code, name_suffix):
    try: 
      driver.get(url)

      WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.XPATH, '//*[@id="game-input"]'))
        ).send_keys(game_code, Keys.ENTER)
      
      # Wait for the nickname input field to be visible and interactable
      player_name_input = WebDriverWait(driver, 10).until(
          EC.presence_of_element_located((By.XPATH, '//*[@id="nickname"]'))
      )
      # Increment name with each join
      player_name_input.send_keys(f"{BASE_NAME}{i+1}")  
      player_name_input.send_keys(Keys.ENTER)

      
      print(f"Successfully joined game as {BASE_NAME}{i+1}")
    except Exception as e:
       print(f"Unexpected error in thread {name_suffix}: {e} :()")


chrome_options = Options()
chrome_options.add_argument("--headless") # Run without rendering Chrome

driver = webdriver.Chrome(options=chrome_options)

for i in range(JOIN_COUNT):
    driver.execute_script("window.open('');") 
    driver.switch_to.window(driver.window_handles[-1])  # Switch to the latest tab
    join_kahoot(driver, KAHOOT_URL, GAME_CODE, i+1)

is_continue = bool(input("Continue for playing the game? (y/n): "))

if is_continue:
   # TODO: add every bot to click preffered button 
   pass
else: 
    driver.quit() 

