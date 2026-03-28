import os
import google.generativeai as genai
from dotenv import load_dotenv
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
print(f"API Key found: {'Yes' if api_key else 'No'}")
genai.configure(api_key=api_key)
persona_path = os.path.join(os.path.dirname(__file__), 'persona.txt')
print(f"Persona Path exists: {os.path.exists(persona_path)}")
with open(persona_path, 'r') as f:
    persona_content = f.read()
gemini_model = genai.GenerativeModel(model_name="gemini-1.5-flash", system_instruction=persona_content)
chat = gemini_model.start_chat()
response = chat.send_message("testing")
print("Response:", response.text)
