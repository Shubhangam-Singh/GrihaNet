import os
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

chat_bp = Blueprint('chat_bp', __name__)

# Basic fallback logic for offline mode
RULES = {
    ("power", "electricity", "energy", "watt", "kw"): 
        "The Power tab tracks your live electricity usage in kilowatts (kW) and tallies your daily/monthly costs. You can turn individual appliances on/off from there to save energy. If you exceed your set budget, you'll receive a warning alert!",
        
    ("network", "bandwidth", "device", "wifi", "internet"): 
        "The Network monitoring tab scans your home router to show every connected device (phones, TVs, laptops). It estimates screen time and bandwidth usage. You can unrecognize unwhitelisted devices to block them instantly.",
        
    ("security", "camera", "motion", "cctv", "video"): 
        "The Camera & Security module streams live video from your home. We use local OpenCV algorithms to detect motion. When someone walks by, it takes a snapshot, logs a timestamped event, and sends a high-severity alert.",
        
    ("automation", "rule", "trigger", "smart"): 
        "Automations act like 'If This Then That' (IFTTT). For example, you can create a rule: 'IF motion is detected in the Backyard, THEN turn on the Backyard Lights'. It connects your sensors to your appliances.",
        
    ("admin", "user", "member", "role", "password"):
        "The Admin panel (only visible to administrators) lets you manage your household members. You can view all accounts, instantly reset forgotten passwords, promote users to admin, or completely suspend someone's access.",
        
    ("demo", "simulation", "fake"):
        "If hardware isn't connected, GrihaNet uses a 'Simulation Mode'. It generates realistic Indian household data: morning/evening power peaks, random motion events every few seconds, and streaming bandwidth spikes."
}

def get_fallback_reply(message):
    message = message.lower()
    for keywords, response in RULES.items():
        if any(kw in message for kw in keywords):
            return response
    return "I'm the GrihaNet assistant. I can help explain the Power, Network, Security, or Admin features. What would you like to know?"

# Try to initialize Google Gemini API if installed and API key is present
gemini_model = None
try:
    import google.generativeai as genai
    from dotenv import load_dotenv
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)
        
        # Load the massive persona file
        persona_path = os.path.join(os.path.dirname(__file__), '..', 'persona.txt')
        if os.path.exists(persona_path):
            with open(persona_path, 'r') as f:
                persona_content = f.read()
            # Initialize with system instructions
            gemini_model = genai.GenerativeModel(
                model_name="gemini-2.5-flash",
                system_instruction=persona_content
            )
except ImportError:
    pass

@chat_bp.route('/ask', methods=['POST'])
@jwt_required(optional=True) # Open to everyone logged in or out
def ask_question():
    data = request.json
    # Check if a history array is sent (new frontend), otherwise fallback to single message
    history = data.get('history', [])
    message = data.get('message', '').strip()
    live_state = data.get('live_state', '')
    
    if not message and not history:
        return jsonify({"reply": "I didn't catch that."}), 400
        
    # If Gemini is configured, use the LLM
    if gemini_model:
        try:
            # Format history for Gemini API
            gemini_history = []
            for msg in history:
                if msg.get('role') in ['user', 'model', 'bot']:
                    role = 'user' if msg.get('role') == 'user' else 'model'
                    gemini_history.append({
                        "role": role,
                        "parts": [msg.get('text', '')]
                    })
            
            # Start a chat session with the formatted history
            chat = gemini_model.start_chat(history=gemini_history)
            
            # Send the new message
            # If no new message is provided but history is (rare), use the last user message
            if message:
                prompt = message
                if live_state:
                    prompt = f"[HIDDEN APP CONTEXT - User's live dashboard right now: {live_state}]\nUser Question: {message}"
                response = chat.send_message(prompt)
                reply = response.text
            else:
                reply = "How can I assist you with GrihaNet today?"
                
            return jsonify({"reply": reply})
            
        except Exception as e:
            print(f"Gemini API Error: {e}")
            # Fallback smoothly to offline mode
            return jsonify({
                "reply": f"[LLM Offline] {get_fallback_reply(message or history[-1].get('text', ''))}"
            })
            
    # Fallback offline mode
    fallback_message = message if message else history[-1].get('text', '')
    return jsonify({"reply": get_fallback_reply(fallback_message)})
