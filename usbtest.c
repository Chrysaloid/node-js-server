#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <libusb-1.0/libusb.h>

int main(int argc, char **argv) {
	printf("main\n");

	libusb_context *context = NULL;
	libusb_device_handle *handle = NULL;
	libusb_device *device;
	struct libusb_device_descriptor desc;
	unsigned char buffer[256];
	int fd;

	if (!(argc > 1 && sscanf(argv[1], "%d", &fd) == 1)) {
		fprintf(stderr, "Usage: %s <fd>\n", argv[0]);
		return 1;
	}

	libusb_set_option(NULL, LIBUSB_OPTION_WEAK_AUTHORITY);

	if (libusb_init(&context) != 0) {
		fprintf(stderr, "libusb_init failed\n");
		return 1;
	}

	if (libusb_wrap_sys_device(context, (intptr_t) fd, &handle) != 0) {
		fprintf(stderr, "libusb_wrap_sys_device failed\n");
		libusb_exit(context);
		return 1;
	}

	device = libusb_get_device(handle);

	if (libusb_get_device_descriptor(device, &desc) != 0) {
		fprintf(stderr, "Failed to get device descriptor\n");
		libusb_close(handle);
		libusb_exit(context);
		return 1;
	}

	printf("Vendor ID: %04x\n", desc.idVendor);
	printf("Product ID: %04x\n", desc.idProduct);

	// Manufacturer
	if (desc.iManufacturer) {
		int r = libusb_get_string_descriptor_ascii(handle, desc.iManufacturer, buffer, sizeof(buffer));
		if (r >= 0)
			printf("Manufacturer: %s\n", buffer);
		else
			printf("Manufacturer: <unavailable>\n");
	} else {
		printf("Manufacturer: <none>\n");
	}

	// Product
	if (desc.iProduct) {
		int r = libusb_get_string_descriptor_ascii(handle, desc.iProduct, buffer, sizeof(buffer));
		if (r >= 0)
			printf("Product: %s\n", buffer);
		else
			printf("Product: <unavailable>\n");
	} else {
		printf("Product: <none>\n");
	}

	// Serial Number
	if (desc.iSerialNumber) {
		int r = libusb_get_string_descriptor_ascii(handle, desc.iSerialNumber, buffer, sizeof(buffer));
		if (r >= 0)
			printf("Serial No: %s\n", buffer);
		else
			printf("Serial No: <unavailable>\n");
	} else {
		printf("Serial No: <none>\n");
	}

	libusb_close(handle);
	libusb_exit(context);
	return 0;
}
