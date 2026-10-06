#include <Arduino.h>
#include <driver/gpio.h>
#include <driver/i2s.h>
#include <hal/gpio_ll.h>
#include <math.h>
#include <soc/gpio_struct.h>

// Fios atuais na protoboard (nao mude os jumpers):
// GPIO 4 = fio que voce acha que e SD
// GPIO 5 = fio que voce acha que e WS
// GPIO 6 = fio que voce acha que e SCK
static const int PIN_A = 4;
static const int PIN_B = 5;
static const int PIN_C = 6;
static const int PIN_I2S_DOUT_DUMMY = 7;
static const i2s_port_t I2S_PORT = I2S_NUM_1;
static const int SAMPLE_RATE = 16000;
static const int BUFFER_LEN = 256;

int32_t i2sBuffer[BUFFER_LEN];
int pinSck = PIN_C;
int pinWs = PIN_B;
int pinSd = PIN_A;
int mapIndex = 0;
uint32_t lastMapChange = 0;
bool i2sRunning = false;

static inline int pinRead(int pin) { return (GPIO.in >> pin) & 1; }

static uint32_t countEdges(int pin, uint32_t durationMs) {
  uint32_t edges = 0;
  int last = pinRead(pin);
  const uint32_t start = millis();
  while ((millis() - start) < durationMs) {
    const int now = pinRead(pin);
    if (now != last) {
      edges++;
      last = now;
    }
  }
  return edges;
}

static void stopI2S() {
  if (!i2sRunning) {
    return;
  }
  i2s_stop(I2S_PORT);
  i2s_driver_uninstall(I2S_PORT);
  i2sRunning = false;
}

static bool startI2S(int sck, int ws, int sd) {
  gpio_reset_pin((gpio_num_t)sck);
  gpio_reset_pin((gpio_num_t)ws);
  gpio_reset_pin((gpio_num_t)sd);
  gpio_reset_pin((gpio_num_t)PIN_I2S_DOUT_DUMMY);

  i2s_config_t i2sConfig = {
      .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_TX),
      .sample_rate = SAMPLE_RATE,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
      .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
      .communication_format = I2S_COMM_FORMAT_STAND_I2S,
      .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
      .dma_buf_count = 8,
      .dma_buf_len = BUFFER_LEN,
      .use_apll = false,
      .tx_desc_auto_clear = true,
      .fixed_mclk = 0,
      .mclk_multiple = I2S_MCLK_MULTIPLE_256,
      .bits_per_chan = I2S_BITS_PER_CHAN_32BIT,
      .chan_mask = (i2s_channel_t)(I2S_TDM_ACTIVE_CH0 | I2S_TDM_ACTIVE_CH1),
      .total_chan = 2,
      .left_align = false,
      .big_edin = false,
      .bit_order_msb = false,
      .skip_msk = false,
  };

  i2s_pin_config_t pinConfig = {
      .mck_io_num = I2S_PIN_NO_CHANGE,
      .bck_io_num = sck,
      .ws_io_num = ws,
      .data_out_num = PIN_I2S_DOUT_DUMMY,
      .data_in_num = sd,
  };

  if (i2s_driver_install(I2S_PORT, &i2sConfig, 0, NULL) != ESP_OK) {
    return false;
  }
  if (i2s_set_pin(I2S_PORT, &pinConfig) != ESP_OK) {
    return false;
  }
  i2s_start(I2S_PORT);
  gpio_ll_input_enable(&GPIO, (gpio_num_t)sck);
  gpio_ll_input_enable(&GPIO, (gpio_num_t)ws);
  gpio_ll_input_enable(&GPIO, (gpio_num_t)sd);
  i2sRunning = true;
  return true;
}

static void applyMap(int index) {
  stopI2S();
  switch (index) {
    case 0:
      pinSck = PIN_C;
      pinWs = PIN_B;
      pinSd = PIN_A;
      break;
    case 1:
      pinSck = PIN_B;
      pinWs = PIN_C;
      pinSd = PIN_A;
      break;
    default:
      pinSck = PIN_C;
      pinWs = PIN_A;
      pinSd = PIN_B;
      break;
  }
  startI2S(pinSck, pinWs, pinSd);
  Serial.printf("\n>>> MAPA %d  SCK=GPIO%d  WS=GPIO%d  SD=GPIO%d\n",
                index, pinSck, pinWs, pinSd);
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Serial.println();
  Serial.println("INMP441: clock OK, SD parado. Testando troca de pinos.");
  Serial.println("Nao mexa nos fios. Cada mapa dura 5s.");
  Serial.println("Se SD continuar 0: jumper GPIO4 no GPIO6. SD tem que copiar o SCK.");
  applyMap(0);
  lastMapChange = millis();
}

void loop() {
  if (millis() - lastMapChange > 5000) {
    mapIndex = (mapIndex + 1) % 3;
    applyMap(mapIndex);
    lastMapChange = millis();
  }

  size_t bytesRead = 0;
  i2s_read(I2S_PORT, i2sBuffer, sizeof(i2sBuffer), &bytesRead, pdMS_TO_TICKS(200));

  const uint32_t sckEdges = countEdges(pinSck, 20);
  const uint32_t wsEdges = countEdges(pinWs, 20);
  const uint32_t sdEdges = countEdges(pinSd, 20);

  Serial.printf("MAPA%d SCK=%u WS=%u SD=%u raw=%08X  %s\n",
                mapIndex,
                sckEdges,
                wsEdges,
                sdEdges,
                bytesRead >= 4 ? (unsigned)i2sBuffer[0] : 0,
                sdEdges > 20 ? "SD VIVO" : "SD morto");
}
