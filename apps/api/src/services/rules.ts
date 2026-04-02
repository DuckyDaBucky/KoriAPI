import type { DeviceConfig, NotificationSeverity } from "@kori/shared";
import type { RuleNotification, SensorIngestionInput } from "./types.js";

function buildNotification(
  severity: NotificationSeverity,
  type: string,
  title: string,
  body: string
): RuleNotification {
  return {
    severity,
    type,
    title,
    body
  };
}

export function evaluateRules(input: SensorIngestionInput, config: DeviceConfig): RuleNotification[] {
  const notifications: RuleNotification[] = [];
  const thresholds = config.thresholds;

  if ((input.sensors.co2 ?? 0) > thresholds.co2Ppm) {
    notifications.push(
      buildNotification(
        "high",
        "co2_high",
        "Air quality alert",
        `CO2 reached ${input.sensors.co2} ppm. Consider ventilation.`
      )
    );
  }

  if (input.sensors.noise > thresholds.noisePct) {
    notifications.push(
      buildNotification(
        "medium",
        "noise_high",
        "Noise disruption",
        `Noise level is ${Math.round(input.sensors.noise)}%. Focus may be affected.`
      )
    );
  }

  if ((input.sensors.temp ?? Number.NaN) > thresholds.temperatureHighC) {
    notifications.push(
      buildNotification(
        "medium",
        "temperature_high",
        "Temperature is high",
        `Temperature is ${input.sensors.temp}C. Consider cooling the room.`
      )
    );
  }

  if ((input.sensors.temp ?? Number.NaN) < thresholds.temperatureLowC) {
    notifications.push(
      buildNotification(
        "low",
        "temperature_low",
        "Temperature is low",
        `Temperature is ${input.sensors.temp}C. Consider warming the room.`
      )
    );
  }

  if (input.health.bme280 === "disconnected" || input.health.ccs811 === "disconnected") {
    notifications.push(
      buildNotification(
        "high",
        "sensor_disconnected",
        "Sensor disconnected",
        "A required environment sensor is disconnected."
      )
    );
  }

  return notifications;
}
