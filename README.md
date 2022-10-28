# TI-84 Plus CE Video Converter

This is a simple program that converts videos to the format that the TI-84 Plus CE can play. It uses the [FFmpeg](https://ffmpeg.org/) library to extract frames and uses the [TI-Toolchain](https://github.com/CE-Programming/toolchain) to convert the frames to the format that the calculator can play and compile the program.

## Requirements

- [FFmpeg](https://ffmpeg.org/) (Must be in PATH)
- [CE Dev Release](https://github.com/CE-Programming/toolchain/releases/) (Must have the `bin` directory added to PATH)
- [Node.js 12+](https://nodejs.org/en/download/) (Must be in PATH)
- TI-84 Plus CE pre-M with OS 5.4 or below

## Installation

1. Clone the repository
2. Run `npm install` in the repository directory
3. Run `npm run build` in the repository directory

## Usage

1. Run `npm start <filename>` in the repository directory
2. The frames will be extracted and put into the `frames/{filename}` directory
3. The frames will be converted to the format that the calculator can play and the C source code will be generated in the `calc/{filename}-{width}x{height}` directory

## Compilation instructions

1. Navigate to the `calc/{filename}-{width}x{height}` directory
2. Build with make
  a. Windows Powershell: `make "-j$($env:NUMBER_OF_PROCESSORS)"`
  b. Windows CMD: `make "-j%NUMBER_OF_PROCESSORS%"`
  c. Linux: `make -j$(nproc)`
3. Copy the .8xp and .8xv files (if generated) to the calculator
4. Run the program on the calculator

## License

Apache 2.0

## Credits

- 1nch (me) for making this program
- [FFmpeg](https://ffmpeg.org/)
- [CE-Programming](https://github.com/CE-Programming)
- [Node.js](https://nodejs.org/en/)
