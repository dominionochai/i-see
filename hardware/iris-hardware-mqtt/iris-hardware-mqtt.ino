#include <rpcWiFi.h>
#include <PubSubClient.h>
#include <TFT_eSPI.h>
#include <ArduinoJson.h>

// --- UPDATE THESE TWO LINES ---
const char* ssid = "your wifi ssid";
const char* password = "your wifi password";
const char* mqtt_server = "192.168.1.7"; // Your computer's IP address
// --------------------------------

const char* topic = "iris/room/action";

WiFiClient wioClient;
PubSubClient mqtt(wioClient);
TFT_eSPI tft = TFT_eSPI();

// State tracking for the animation loop
enum RoomState { IDLE, FAN_ON, LIGHT_ON };
RoomState currentState = IDLE;

// Animation Variables
int fanAngle = 0;
unsigned long lastFrameTime = 0;
int centerX = 160; // Center of the Wio Terminal screen width
int centerY = 140; // Slightly lower to make room for text
int radius = 55;   // Size of the fan blades

void setup() {
    Serial.begin(115200);
    
    tft.begin();
    tft.setRotation(3); // Landscape layout
    tft.fillScreen(TFT_BLACK);
    tft.setTextColor(TFT_WHITE);
    tft.setTextSize(2);
    tft.drawString("Connecting Wi-Fi...", 10, 10);
    
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    
    tft.fillScreen(TFT_BLACK);
    tft.drawString("Wi-Fi Connected!", 10, 10);
    
    mqtt.setServer(mqtt_server, 1883);
    mqtt.setCallback(mqttCallback);
}

// Function to draw or erase the fan directly on the screen
void drawFan(int angle, uint16_t color) {
    for(int i = 0; i < 3; i++) {
        // Offset each blade by 120 degrees
        float rad = (angle + (i * 120)) * 0.0174533; 
        
        int tipX = centerX + cos(rad) * radius;
        int tipY = centerY + sin(rad) * radius;
        
        int baseOffsetX = centerX + cos(rad + 0.5) * (radius * 0.4);
        int baseOffsetY = centerY + sin(rad + 0.5) * (radius * 0.4);
        
        tft.fillTriangle(centerX, centerY, tipX, tipY, baseOffsetX, baseOffsetY, color);
    }
    // Always draw a white hub in the center
    tft.fillCircle(centerX, centerY, 10, TFT_WHITE);
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, payload, length);

    if (error) {
        Serial.println("Failed to read JSON");
        return;
    }

    const char* device = doc["device"];
    const char* state = doc["state"];

    RoomState newState = IDLE;
    if (strcmp(device, "fan") == 0 && strcmp(state, "ON") == 0) {
        newState = FAN_ON;
    } 
    else if (strcmp(device, "light") == 0 && strcmp(state, "ON") == 0) {
        newState = LIGHT_ON;
    }

    // Only redraw the static background text if the state changes
    if (newState != currentState) {
        currentState = newState;
        tft.fillScreen(TFT_BLACK);

        if (currentState == LIGHT_ON) {
            // Fill screen with a warm, glowing tungsten yellow
            uint16_t warmGlow = tft.color565(255, 210, 80); 
            tft.fillScreen(warmGlow);
            
            tft.setTextColor(TFT_BLACK);
            tft.setTextSize(3);
            tft.drawString("LIGHTS ON", 85, 100);
        }
        else if (currentState == FAN_ON) {
            tft.setTextColor(TFT_CYAN);
            tft.setTextSize(3);
            tft.drawString("FAN ACTIVATED", 45, 30); 
            
            // Draw the very first frame of the fan
            drawFan(fanAngle, TFT_CYAN);
        }
        else {
            tft.setTextColor(TFT_WHITE);
            tft.setTextSize(3);
            tft.drawString("SYSTEM IDLE", 65, 100);
        }
    }
}

void reconnect() {
    while (!mqtt.connected()) {
        tft.fillScreen(TFT_BLACK);
        tft.setTextSize(2);
        tft.drawString("Connecting to Broker...", 10, 10);
        
        if (mqtt.connect("WioTerminal_Iris")) {
            mqtt.subscribe(topic);; // Use 'this->topic' to avoid shadowing issues
            currentState = IDLE;
            tft.fillScreen(TFT_BLACK);
            tft.setTextColor(TFT_GREEN);
            tft.drawString("Awaiting Commands...", 20, 100);
        } else {
            delay(5000);
        }
    }
}

void loop() {
    if (!mqtt.connected()) {
        reconnect();
    }
    mqtt.loop(); 
    
    // The Non-Blocking Animation Loop
    if (currentState == FAN_ON) {
        // Update the fan every 30 milliseconds
        if (millis() - lastFrameTime > 30) { 
            
            // 1. Erase the old blades by drawing them black
            drawFan(fanAngle, TFT_BLACK); 
            
            // 2. Calculate the new angle (spin by 15 degrees)
            fanAngle = (fanAngle + 15) % 360; 
            
            // 3. Draw the new blades in Cyan
            drawFan(fanAngle, TFT_CYAN); 
            
            lastFrameTime = millis();
        }
    }
}