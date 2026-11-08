import { describe, expect, it, vi } from 'vitest';
import type { Device } from 'react-native-ble-plx';

import { FINAGOTCHI_SERVICE_UUID, PROVISIONING_CHAR_UUID } from '../types';
import {
    validateWifiCredentials,
    WifiProvisionMtuError,
    writeWifiCredentialsToDevice,
} from '../wifiProvision';

function makeDevice() {
    const write = vi.fn().mockResolvedValue({});
    return {
        device: { writeCharacteristicWithResponseForService: write } as unknown as Device,
        write,
    };
}

describe('Wi-Fi provisioning validation', () => {
    it('accepts WPA and open-network credentials', () => {
        expect(validateWifiCredentials('HomeWifi', 'hunter23')).toBeNull();
        expect(validateWifiCredentials('OpenWifi', '')).toBeNull();
    });

    it('rejects short passwords before writing', async () => {
        const { device, write } = makeDevice();
        await expect(
            writeWifiCredentialsToDevice(device, 'HomeWifi', 'short')
        ).rejects.toThrow('8–63 bytes');
        expect(write).not.toHaveBeenCalled();
    });

    it('uses UTF-8 byte length for the firmware SSID limit', () => {
        expect(validateWifiCredentials('é'.repeat(17), 'hunter23')).toMatch(
            '1–32 UTF-8 bytes'
        );
    });
});

describe('Wi-Fi provisioning writes', () => {
    it('writes the exact three-field payload', async () => {
        const { device, write } = makeDevice();
        await writeWifiCredentialsToDevice(
            device,
            'HomeWifi',
            'hunter23',
            'device-token',
            253
        );

        expect(write).toHaveBeenCalledWith(
            FINAGOTCHI_SERVICE_UUID,
            PROVISIONING_CHAR_UUID,
            Buffer.from('HomeWifi\nhunter23\ndevice-token', 'utf8').toString('base64')
        );
    });

    it('rejects a payload that exceeds the negotiated BLE payload', async () => {
        const { device, write } = makeDevice();
        await expect(
            writeWifiCredentialsToDevice(
                device,
                'HomeWifi',
                'hunter23',
                'a'.repeat(128),
                20
            )
        ).rejects.toBeInstanceOf(WifiProvisionMtuError);
        expect(write).not.toHaveBeenCalled();
    });

    it('rejects malformed tokens without writing', async () => {
        const { device, write } = makeDevice();
        await expect(
            writeWifiCredentialsToDevice(
                device,
                'HomeWifi',
                'hunter23',
                'bad\ntoken',
                253
            )
        ).rejects.toThrow('Device token');
        expect(write).not.toHaveBeenCalled();
    });
});
