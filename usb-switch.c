#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <libusb-1.0/libusb.h>
#include <unistd.h>

// CH340 vendor requests
#define CH340_REQ_WRITE_REG   0x9A
#define CH340_REQ_SERIAL_INIT 0xA1
#define CH340_REQ_MODEM_CTRL  0xA4

// CH340 register addresses
#define CH340_REG_LCR         0x18

// LCR bits
#define CH340_LCR_ENABLE_RX   0x80
#define CH340_LCR_ENABLE_TX   0x40
#define CH340_LCR_CS8         0x03

// Modem control bits (inverted in CH340)
#define CH340_BIT_RTS         0x40
#define CH340_BIT_DTR         0x20

// Relay command sequences
static unsigned char RELAY_ON[]  = {0xA0, 0x01, 0x01, 0xA2};
static unsigned char RELAY_OFF[] = {0xA0, 0x01, 0x00, 0xA1};

// Global quiet flag - set from QUIET env var
static int quiet = 0;

#define LOG(fmt, ...) if (!quiet) { printf(fmt, ##__VA_ARGS__); fflush(stdout); }

static int ch340_control_out(libusb_device_handle *h, uint8_t req, uint16_t val, uint16_t idx) {
	int r = libusb_control_transfer(h, LIBUSB_REQUEST_TYPE_VENDOR | LIBUSB_RECIPIENT_DEVICE | LIBUSB_ENDPOINT_OUT, req, val, idx, NULL, 0, 1000);
	if (r < 0)
		fprintf(stderr, "control_out req=0x%02X val=0x%04X idx=0x%04X failed: %s\n", req, val, idx, libusb_error_name(r));
	return r;
}

static int ch340_control_in(libusb_device_handle *h, uint8_t req, uint16_t val, uint16_t idx, unsigned char *buf, uint16_t len) {
	int r = libusb_control_transfer(h, LIBUSB_REQUEST_TYPE_VENDOR | LIBUSB_RECIPIENT_DEVICE | LIBUSB_ENDPOINT_IN, req, val, idx, buf, len, 1000);
	if (r < 0)
		fprintf(stderr, "control_in req=0x%02X failed: %s\n", req, libusb_error_name(r));
	return r;
}

static int ch340_init(libusb_device_handle *h) {
	unsigned char buf[8];
	int r;

	// Reset / handshake
	r = ch340_control_out(h, CH340_REQ_SERIAL_INIT, 0, 0);
	if (r < 0) return r;

	// Read chip version - required, otherwise chip ignores further commands
	r = ch340_control_in(h, 0x5F, 0, 0, buf, 2);
	if (r >= 0)
		LOG("CH340 version: 0x%02X 0x%02X\n", buf[0], buf[1]);

	// Baud rate: 9600 (values from Linux kernel ch341.c)
	r = ch340_control_out(h, CH340_REQ_WRITE_REG, 0x1312, 0xB282);
	if (r < 0) return r;
	r = ch340_control_out(h, CH340_REQ_WRITE_REG, 0x0F2C, 0x0014);
	if (r < 0) return r;

	// Line control: 8N1, enable TX+RX
	r = ch340_control_out(h, CH340_REQ_WRITE_REG, CH340_REG_LCR, CH340_LCR_ENABLE_RX | CH340_LCR_ENABLE_TX | CH340_LCR_CS8);
	if (r < 0) return r;

	// Assert DTR + RTS (active low in CH340 - pass complement bits)
	r = ch340_control_out(h, CH340_REQ_MODEM_CTRL, ~(CH340_BIT_DTR | CH340_BIT_RTS) & 0xFF, 0);
	if (r < 0) return r;

	usleep(100000); // 100 ms - let the chip settle
	return 0;
}

static int send_command(libusb_device_handle *handle, unsigned char ep_out, unsigned char *data, size_t data_len) {
	int transferred = 0;
	int r = libusb_bulk_transfer(handle, ep_out, data, data_len, &transferred, 1000);
	LOG("Write result: %d, bytes transferred: %d\n", r, transferred);
	if (r != 0) {
		fprintf(stderr, "Bulk transfer error: %s\n", libusb_error_name(r));
		return r;
	}
	return 0;
}

int main(int argc, char **argv) {
	libusb_context *context = NULL;
	libusb_device_handle *handle = NULL;
	libusb_device *device;
	struct libusb_device_descriptor desc;
	struct libusb_config_descriptor *config;
	const struct libusb_interface_descriptor *iface;
	const struct libusb_endpoint_descriptor *ep;
	int fd;
	int exit_code = 0;

	// Read QUIET env var
	const char *quiet_env = getenv("QUIET");
	if (quiet_env != NULL && strcmp(quiet_env, "1") == 0)
		quiet = 1;

	// Read SWITCH env var
	const char *switch_env = getenv("SWITCH");
	if (switch_env == NULL) {
		fprintf(stderr, "Error: SWITCH env var not set. Use SWITCH=ON, SWITCH=OFF or SWITCH=READ.\n");
		return 1;
	}

	int mode_read = 0;
	unsigned char *data = NULL;
	size_t data_len = 0;

	if (strcmp(switch_env, "ON") == 0) {
		data = RELAY_ON;
		data_len = sizeof(RELAY_ON);
	} else if (strcmp(switch_env, "OFF") == 0) {
		data = RELAY_OFF;
		data_len = sizeof(RELAY_OFF);
	} else if (strcmp(switch_env, "READ") == 0) {
		mode_read = 1;
	} else {
		fprintf(stderr, "Error: SWITCH must be ON, OFF or READ, got: %s\n", switch_env);
		return 1;
	}

	// fd from argv[1] (passed by termux-usb)
	if (!(argc > 1 && sscanf(argv[1], "%d", &fd) == 1)) {
		fprintf(stderr, "Usage: %s <fd>\n", argv[0]);
		return 1;
	}

	LOG("Starting... (SWITCH=%s)\n", switch_env);

	libusb_set_option(NULL, LIBUSB_OPTION_WEAK_AUTHORITY);

	if (libusb_init(&context) != 0) {
		fprintf(stderr, "libusb_init failed\n");
		return 1;
	}

	if (libusb_wrap_sys_device(context, (intptr_t)fd, &handle) != 0) {
		fprintf(stderr, "wrap_sys_device failed\n");
		libusb_exit(context);
		return 1;
	}

	device = libusb_get_device(handle);

	if (libusb_get_device_descriptor(device, &desc) != 0) {
		fprintf(stderr, "descriptor failed\n");
		libusb_close(handle);
		libusb_exit(context);
		return 1;
	}
	LOG("VID: %04x PID: %04x\n", desc.idVendor, desc.idProduct);

	if (libusb_get_active_config_descriptor(device, &config) != 0) {
		fprintf(stderr, "config failed\n");
		libusb_close(handle);
		libusb_exit(context);
		return 1;
	}

	int iface_num = config->interface[0].altsetting[0].bInterfaceNumber;
	libusb_claim_interface(handle, iface_num);

	iface = &config->interface[0].altsetting[0];

	unsigned char ep_out = 0;
	for (int i = 0; i < iface->bNumEndpoints; i++) {
		ep = &iface->endpoint[i];
		if ((ep->bmAttributes & LIBUSB_TRANSFER_TYPE_MASK) == LIBUSB_TRANSFER_TYPE_BULK &&
			(ep->bEndpointAddress & LIBUSB_ENDPOINT_DIR_MASK) == LIBUSB_ENDPOINT_OUT) {
			ep_out = ep->bEndpointAddress;
		}
	}
	LOG("Endpoint OUT: 0x%02X\n", ep_out);

	if (ep_out == 0) {
		fprintf(stderr, "No bulk OUT endpoint found!\n");
		exit_code = 1;
		goto cleanup;
	}

	LOG("Initializing CH340...\n");
	if (ch340_init(handle) < 0) {
		fprintf(stderr, "CH340 init failed\n");
		exit_code = 1;
		goto cleanup;
	}
	LOG("Init done.\n");

	if (mode_read) {
		LOG("Ready. Send: 1=ON, 0=OFF, q=quit\n");
		int c;
		while ((c = getchar()) != EOF) {
			if (c == '1') {
				LOG("Sending ON...\n");
				if (send_command(handle, ep_out, RELAY_ON, sizeof(RELAY_ON)) != 0) {
					exit_code = 1;
					break;
				} else {
					LOG("Relay ON.\n");
				}
			} else if (c == '0') {
				LOG("Sending OFF...\n");
				if (send_command(handle, ep_out, RELAY_OFF, sizeof(RELAY_OFF)) != 0) {
					exit_code = 1;
					break;
				} else {
					LOG("Relay OFF.\n");
				}
			} else if (c == 'q') {
				LOG("Quitting.\n");
				break;
			}
			// all other characters (including '\n') are silently ignored
		}
	} else {
		if (send_command(handle, ep_out, data, data_len) != 0)
			exit_code = 1;
		else
			LOG("Relay %s command sent successfully.\n", switch_env);
		usleep(200000); // 200 ms
	}

cleanup:
	libusb_release_interface(handle, iface_num);
	libusb_free_config_descriptor(config);
	libusb_close(handle);
	libusb_exit(context);
	return exit_code;
}
