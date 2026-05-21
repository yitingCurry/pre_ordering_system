import csv
import random
import time
from selenium.common.exceptions import ElementClickInterceptedException, NoSuchElementException, StaleElementReferenceException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
import undetected_chromedriver as uc

MAPS_URL = "https://www.google.com/maps/place/香港鑫華茶餐廳/@25.0315368,121.5285299,17z/data=!4m6!3m5!1s0x3442a98363c3e723:0xe06da9a5893f3509!8m2!3d25.0315368!4d121.5285299!16s%2Fg%2F1tmk6619"
LOGIN_URL = "https://accounts.google.com/ServiceLogin?hl=zh-TW"

# Google Maps 目前評論頁常見的 DevTools XPath / DOM 定位
REVIEW_TAB_XPATH = "//button[@role='tab' and contains(@aria-label, '評論')]"
SCROLL_CONTAINER_XPATH = (
    "//div[contains(@class, 'm6QErb') "
    "and contains(@class, 'DxyBCb') "
    "and contains(@class, 'kA9KIf') "
    "and contains(@class, 'dS8AEf')]"
)
REVIEW_CARD_XPATH = "//div[@data-review-id]"
MORE_BUTTON_XPATH = (
    ".//button[@data-review-id "
    "and @aria-expanded='false' "
    "and (contains(@aria-label, '顯示更多') "
    "or contains(@aria-label, '查看更多') "
    "or normalize-space(.)='更多')]"
)
REVIEWER_NAME_XPATH = ".//div[contains(@class, 'd4r55')]"
RATING_XPATH = ".//*[@role='img' and contains(@aria-label, '顆星')]"
REVIEW_TEXT_XPATH = ".//span[contains(@class, 'wiI7pd')]"


class SimpleMapsScraper:

    def __init__(self):
        print("正在啟動 Google Maps 偽裝瀏覽器...")
        options = uc.ChromeOptions()
        options.add_argument("--start-maximized")
        options.add_argument("--lang=zh-TW")

        self.driver = uc.Chrome(options=options)
        self.posts_data = []
        self.saved_count = 0

        # 精準定位評論列表的動態滾動容器
        self.container_xpath = SCROLL_CONTAINER_XPATH

    def manual_login_flow(self):
        """第一步：導向登入頁面，並等待使用者手動操作"""
        print("\n🔑 正在開啟 Google 登入頁面...")
        self.driver.get(LOGIN_URL)
        
        print("\n" + "="*50)
        print("📢 【請注意：現在是手動時間】")
        print("1. 請在跳出的 Chrome 視窗中輸入你的 Google 帳號密碼並完成登入。")
        print("2. 如果有二階段驗證（手機點擊、簡訊），請一併完成。")
        print("3. 看到順利登入進到 Google 首頁或個人設定後...")
        print("👉 請回到這個 Python 終端機視窗，按下 [Enter] 鍵讓程式繼續！")
        print("="*50 + "\n")
        
        input("請在登入完成後，按 [Enter] 鍵繼續...")
        print("\n✅ 收到確認！準備前往目標餐廳網頁...")

    def open_target(self):
        """第二步：前往目標餐廳並切換到評論區"""
        print("🔍 正在直接前往鑫華茶餐廳頁面...")
        self.driver.get(MAPS_URL)
        time.sleep(5) 

        print("鄰近網頁載入完成，正在切換至『評論』頁籤...")
        try:
            review_tab_btn = WebDriverWait(self.driver, 15).until(
                EC.element_to_be_clickable(
                    (By.XPATH, REVIEW_TAB_XPATH)
                )
            )
            review_tab_btn.click()
            print("✅ 成功點擊評論按鈕！")
            time.sleep(3)
        except Exception as e:
            print("⚠️ 無法自動點擊評論按鈕，若畫面未顯示評論，請在瀏覽器上「手動點一下」評論頁籤。")

        try:
            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.XPATH, self.container_xpath))
            )
            time.sleep(random.uniform(2.0, 3.5))
        except:
            print("❌ 尋找滾動容器超時！請確認畫面是否停留在評論列表。")

    def collect_reviews(self, max_posts=10, save_every=10, file_name="xin_hua_reviews.csv"):
        print(f"🔽 開始向下滾動，目標抓取 {max_posts} 則評論...")
        no_new_count = 0

        try:
            scrollable_div = self.driver.find_element(By.XPATH, self.container_xpath)
        except:
            print("❌ 找不到滾動容器，無法繼續流程。")
            return

        last_height = self.driver.execute_script("return arguments[0].scrollHeight", scrollable_div)

        while len(self.posts_data) < max_posts:
            self.driver.execute_script("arguments[0].scrollTo(0, arguments[0].scrollHeight);", scrollable_div)
            time.sleep(random.uniform(2.5, 4.0))

            # 自動點擊「更多」展開被隱藏的文字
            try:
                review_cards = self.driver.find_elements(By.XPATH, REVIEW_CARD_XPATH)
                for card in review_cards:
                    try:
                        btn = card.find_element(By.XPATH, MORE_BUTTON_XPATH)
                        self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn)
                        time.sleep(1)
                        self.driver.execute_script("arguments[0].click();", btn)
                        time.sleep(1)
                    except (NoSuchElementException, StaleElementReferenceException, ElementClickInterceptedException):
                        continue
            except:
                pass

            # 抓取外層評論卡片
            review_elements = self.driver.find_elements(By.XPATH, REVIEW_CARD_XPATH)

            new_count = 0
            for el in review_elements:
                post = self.extract_data_by_structure(el)
                if post and post not in self.posts_data:
                    self.posts_data.append(post)
                    new_count += 1
                    if len(self.posts_data) % save_every == 0:
                        self.save_to_csv(file_name)
                    if len(self.posts_data) >= max_posts:
                        break

            print(f"🔄 滾動中：本次新增 {new_count} 筆，目前總計累積 {len(self.posts_data)} 筆")

            if len(self.posts_data) >= max_posts:
                print(f"\n🎉 【大成功】總共抓取 {len(self.posts_data)} 筆評論，已儲存至 {file_name}")
                break

            new_height = self.driver.execute_script("return arguments[0].scrollHeight", scrollable_div)
            if new_height == last_height:
                no_new_count += 1
                if no_new_count >= 3:
                    print("⚠️ 到底了，沒有更多評論！")
                    break
            else:
                no_new_count = 0
            last_height = new_height

        if len(self.posts_data) > self.saved_count:
            self.save_to_csv(file_name)

    def extract_data_by_structure(self, review_el):
        """💡 依據動態 ID 規則優化解析邏輯"""
        try:
            # 1. 名字區塊：尋找卡片內的精準名字
            try:
                name = review_el.find_element(By.XPATH, REVIEWER_NAME_XPATH).text.strip()
            except NoSuchElementException:
                name = "匿名用戶"

            # 2. 星級區塊：撈取包含「顆星」的 aria-label
            try:
                star_label = review_el.find_element(By.XPATH, RATING_XPATH).get_attribute("aria-label")
                star = star_label.replace("顆星", "").strip() if star_label else "無"
            except NoSuchElementException:
                star = "無"

            # 3. 評論文字區塊：Google Maps 評論文字目前放在 span.wiI7pd
            try:
                content = review_el.find_element(By.XPATH, REVIEW_TEXT_XPATH).text.strip()
            except NoSuchElementException:
                content = "(僅給分無文字)"

            return {
                "評論者": name,
                "星等": star,
                "評論內容": content
            }
        except Exception as e:
            return None

    def save_to_csv(self, file_name="xin_hua_reviews.csv"):
        if not self.posts_data:
            print("⚠️ 沒有抓到任何資料，取消存檔。")
            return

        keys = self.posts_data[0].keys()
        with open(file_name, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            writer.writerows(self.posts_data)
        self.saved_count = len(self.posts_data)
        print(f"\n🎉 目前總共抓取 {len(self.posts_data)} 筆評論，已儲存至 {file_name}")


if __name__ == "__main__":
    scraper = SimpleMapsScraper()
    scraper.manual_login_flow()  
    scraper.open_target()        
    scraper.collect_reviews(max_posts=2000, save_every=10, file_name="xin_hua_reviews.csv")
    scraper.driver.quit()
    
