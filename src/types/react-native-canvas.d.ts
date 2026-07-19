declare module 'react-native-canvas' {
  import type React from 'react';
  import type { StyleProp, ViewStyle } from 'react-native';

  interface CanvasProps {
    style?: StyleProp<ViewStyle>;
  }

  interface CanvasImageLoadEvent {
    target: CanvasImage;
  }

  interface CanvasRenderingContext2D {
    scale(x: number, y: number): void;
    drawImage(
      image: CanvasImage,
      sx: number,
      sy: number,
      sWidth: number,
      sHeight: number,
      dx: number,
      dy: number,
      dWidth: number,
      dHeight: number
    ): void;
  }

  export default class Canvas extends React.Component<CanvasProps> {
    width: number;
    height: number;

    getContext(context: '2d'): CanvasRenderingContext2D;
    toDataURL(type?: string, encoderOptions?: number): Promise<string>;
  }

  export class Image {
    constructor(canvas: Canvas, height?: number, width?: number);

    width: number;
    height: number;
    src: string;

    addEventListener(
      event: 'load' | 'error',
      callback: (event: CanvasImageLoadEvent) => void
    ): void;
  }
}
