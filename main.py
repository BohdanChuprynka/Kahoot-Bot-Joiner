# Main script 
from selenium import webdriver
from selenium.webdriver.common.keys import Keys 
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from concurrent.futures import ThreadPoolExecutor

import time

# Customization
script_type: str = "faster" # faster or slower
is_continue: bool = False # Option for bots to choose answers 

bot_limit: int = 100 # Stops execution of the code when bot_limit is reached (Safety Reasons)

# Auto Constants
KAHOOT_URL = "https://kahoot.it/"
GAME_CODE = input("Enter game code: ")
BASE_NAME = input("Enter desired name: ")
JOIN_COUNT = int(input("Number of total bots: ")) 
if bot_limit and JOIN_COUNT > bot_limit:
    raise ValueError("Bot limit reached. Consider other options")

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

def join_game(driver, game_code):
      game_code_input = driver.find_element(by=By.XPATH, value='//*[@id="game-input"]')  # Adjust XPath if needed
      game_code_input.send_keys(game_code)
      game_code_input.send_keys(Keys.ENTER)

def nickname_input(driver, url, game_code, name_suffix):
      player_name_input = driver.find_element(by=By.XPATH, value='//*[@id="nickname"]') 
      player_name_input.send_keys(f"{BASE_NAME}{name_suffix+1}")  
      player_name_input.send_keys(Keys.ENTER)


chrome_options = Options()
chrome_options.add_argument("--headless") # Run without rendering Chrome
driver = webdriver.Chrome(options=chrome_options)

if script_type == "faster":
    with ThreadPoolExecutor(max_workers=JOIN_COUNT) as executor:
        for i in range(JOIN_COUNT):
            driver.execute_script("window.open('');")  # Open a new tab
            driver.switch_to.window(driver.window_handles[-1])  # Switch to the latest tab
            driver.get(KAHOOT_URL)

        for i in range(JOIN_COUNT):
            driver.switch_to.window(driver.window_handles[i+1])
            executor.submit(join_game, driver, GAME_CODE).result()
        time.sleep(1) # For all pages to load 
        for i in range(JOIN_COUNT):
            driver.switch_to.window(driver.window_handles[i+1])
            executor.submit(nickname_input, driver, KAHOOT_URL, GAME_CODE, i+1).result()
elif script_type == "slower":
    for i in range(JOIN_COUNT):
        driver.execute_script("window.open('');") 
        driver.switch_to.window(driver.window_handles[-1])  # Switch to the latest tab
        join_kahoot(driver, KAHOOT_URL, GAME_CODE, i+1)
else: 
    raise ValueError("Invalid script type. Change 'script_type' variable to a proper one.")

if not is_continue:
    is_continue = bool(input("Continue for playing the game? (y/n): "))


if is_continue:
    # Red, Blue, Yellow, Green
    button_xpaths = ['/html/body/div[1]/div[1]/div/div/main/div[3]/form/div/div/div[1]/button[1]',
                    '/html/body/div[1]/div[1]/div/div/main/div[3]/form/div/div/div[1]/button[2]',
                    '/html/body/div[1]/div[1]/div/div/main/div[3]/form/div/div/div[2]/button[1]',
                    '/html/body/div[1]/div[1]/div/div/main/div[3]/form/div/div/div[2]/button[2]']

    print("Use following terms: 1: Red, 2: Blue, 3: Yellow, 4: Green, 0: Exit")
    while True:
        try:
            button_id = int(input("Button to click: "))

            if 0 < button_id < 5:
                for i in range(JOIN_COUNT):
                    driver.switch_to.window(driver.window_handles[i+1]) 

                    locate_button = driver.find_element(by=By.XPATH, value=button_xpaths[button_id-1])
                    locate_button.click()
            elif button_id == 0:
                driver.quit()
                print("Run is finished.")
                exit()
            else: 
                print("Invalid input. Try again.")
                break
        except Exception as e:
            continue