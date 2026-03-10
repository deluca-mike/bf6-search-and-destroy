/**
 * Calculates the required input hex color to achieve a desired output hex color,
 * based on how a rendering engine shifted a known previous color.
 * @param {string} knownInput - The original hex color put into the engine (e.g., "#69A7D7")
 * @param {string} knownOutput - The actual rendered hex color (e.g., "#5E96BF")
 * @param {string} desiredOutput - The hex color you WANT to see rendered (e.g., "#67CBDB")
 * @param {string} mode - 'multiplicative' (default/lighting) or 'additive' (post-processing)
 * @returns {string} - The required input hex color
 */
export function getRequiredInputHex(knownInput, knownOutput, desiredOutput, mode = 'multiplicative') {
    // Helper function: Convert Hex to RGB array
    const hexToRgb = (hex) => {
        hex = hex.replace(/^#/, '');
        if (hex.length === 3)
            hex = hex
                .split('')
                .map((c) => c + c)
                .join(''); // Handle shorthand hex
        const num = parseInt(hex, 16);
        return [num >> 16, (num >> 8) & 255, num & 255];
    };

    // Helper function: Convert RGB array back to Hex
    const rgbToHex = (r, g, b) => {
        return (
            '#' +
            [r, g, b]
                .map((x) => {
                    // Round and clamp values between 0 and 255 to ensure a valid color
                    const clamped = Math.max(0, Math.min(255, Math.round(x)));
                    const hexStr = clamped.toString(16);
                    return hexStr.length === 1 ? '0' + hexStr : hexStr;
                })
                .join('')
        );
    };

    const [inR, inG, inB] = hexToRgb(knownInput);
    const [outR, outG, outB] = hexToRgb(knownOutput);
    const [desR, desG, desB] = hexToRgb(desiredOutput);

    let reqR, reqG, reqB;

    if (mode === 'multiplicative') {
        // Determine the ratio of change, protecting against divide-by-zero
        const ratioR = inR !== 0 ? outR / inR : 1;
        const ratioG = inG !== 0 ? outG / inG : 1;
        const ratioB = inB !== 0 ? outB / inB : 1;

        // Divide the desired output by the ratio to find the required input
        reqR = ratioR !== 0 ? desR / ratioR : 0;
        reqG = ratioG !== 0 ? desG / ratioG : 0;
        reqB = ratioB !== 0 ? desB / ratioB : 0;
    } else if (mode === 'additive') {
        // Determine the flat offset applied by the engine
        const diffR = outR - inR;
        const diffG = outG - inG;
        const diffB = outB - inB;

        // Subtract the offset from the desired output to find the required input
        reqR = desR - diffR;
        reqG = desG - diffG;
        reqB = desB - diffB;
    }

    return rgbToHex(reqR, reqG, reqB);
}
