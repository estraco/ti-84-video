import { RGBAarrType } from 'png-to-rgba';

export function frameToPalette_C(frame: RGBAarrType) {
    const palette: string[] = [];

    for (let y = 0; y < frame.length; y++) {
        for (let x = 0; x < frame[y].length; x++) {
            const [_r, _g, _b] = frame[y][x];

            const r = Math.floor(_r / 8);
            const g = Math.floor(_g / 8);
            const b = Math.floor(_b / 8);

            const color = r << 16 | g << 8 | b;

            const colorData = `0x${(color & 0xff).toString().padStart(2, '0')}, 0x${(color >> 8 & 0xff).toString().padStart(2, '0')}, /* rgb(${_r}, ${_g}, ${_b}) */`;

            if (!palette.includes(colorData)) {
                palette.push(colorData);
            }
        }
    }

    return palette;
}

export function mergePalettes(palettes: string[][]) {
    const palette: string[] = [];

    for (const palette of palettes) {
        for (const color of palette) {
            if (!palette.includes(color)) {
                palette.push(color);
            }
        }
    }

    return palette;
}

export function paletteToFile(palette: string[]): string {
    return `unsigned char global_palette[${palette.length * 2}] = {
    ${palette.join('\n    ')}
};
`;
}
