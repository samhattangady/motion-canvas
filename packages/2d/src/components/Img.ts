import {computed, initial, signal} from '../decorators';
import {
  Color,
  PossibleVector2,
  BBox,
  SerializedVector2,
  Vector2,
} from '@motion-canvas/core/lib/types';
import {drawImage} from '../utils';
import {Rect, RectProps} from './Rect';
import {DesiredLength} from '../partials';
import {
  DependencyContext,
  SignalValue,
  SimpleSignal,
} from '@motion-canvas/core/lib/signals';
import {viaProxy} from '@motion-canvas/core/lib/utils';

export interface ImgProps extends RectProps {
  src?: SignalValue<string>;
  alpha?: SignalValue<number>;
  smoothing?: SignalValue<boolean>;
}

export class Img extends Rect {
  private static pool: Record<string, HTMLImageElement> = {};

  @signal()
  public declare readonly src: SimpleSignal<string, this>;

  @initial(1)
  @signal()
  public declare readonly alpha: SimpleSignal<number, this>;

  @initial(true)
  @signal()
  public declare readonly smoothing: SimpleSignal<boolean, this>;

  public constructor(props: ImgProps) {
    super(props);
  }

  protected override desiredSize(): SerializedVector2<DesiredLength> {
    const custom = super.desiredSize();
    if (custom.x === null && custom.y === null) {
      const image = this.image();
      return {
        x: image.naturalWidth,
        y: image.naturalHeight,
      };
    }

    return custom;
  }

  @computed()
  protected image(): HTMLImageElement {
    const src = viaProxy(this.src());
    if (Img.pool[src]) {
      return Img.pool[src];
    }

    const image = document.createElement('img');
    image.crossOrigin = 'anonymous';
    image.src = src;
    if (!image.complete) {
      DependencyContext.collectPromise(
        new Promise((resolve, reject) => {
          image.addEventListener('load', resolve);
          image.addEventListener('error', reject);
        }),
      );
    }
    Img.pool[src] = image;

    return image;
  }

  @computed()
  protected imageCanvas(): CanvasRenderingContext2D {
    const canvas = document
      .createElement('canvas')
      .getContext('2d', {willReadFrequently: true});
    if (!canvas) {
      throw new Error('Could not create an image canvas');
    }

    return canvas;
  }

  @computed()
  protected filledImageCanvas() {
    const context = this.imageCanvas();
    const image = this.image();
    context.canvas.width = image.naturalWidth;
    context.canvas.height = image.naturalHeight;
    context.imageSmoothingEnabled = this.smoothing();
    context.drawImage(image, 0, 0);

    return context;
  }

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawShape(context);
    if (this.clip()) {
      context.clip(this.getPath());
    }
    const alpha = this.alpha();
    if (alpha > 0) {
      const box = BBox.fromSizeCentered(this.computedSize());
      context.save();
      if (alpha < 1) {
        context.globalAlpha *= alpha;
      }
      context.imageSmoothingEnabled = this.smoothing();
      drawImage(context, this.image(), box);
      context.restore();
    }
    this.drawChildren(context);
  }

  protected override applyFlex() {
    super.applyFlex();
    const image = this.image();
    this.element.style.aspectRatio = (
      this.ratio() ?? image.naturalWidth / image.naturalHeight
    ).toString();
  }

  /**
   * Get color of the image at the given position.
   *
   * @param position - The position in local space at which to sample the color.
   */
  public getColorAtPoint(position: PossibleVector2): Color {
    const image = this.image();
    const size = this.computedSize();
    const naturalSize = new Vector2(image.naturalWidth, image.naturalHeight);

    const pixelPosition = new Vector2(position)
      .add(this.computedSize().scale(0.5))
      .mul(naturalSize.div(size).safe);

    return this.getPixelColor(pixelPosition);
  }

  /**
   * Get color of the image at the given pixel.
   *
   * @param position - The pixel's position.
   */
  public getPixelColor(position: PossibleVector2): Color {
    const context = this.filledImageCanvas();
    const vector = new Vector2(position);
    const data = context.getImageData(vector.x, vector.y, 1, 1).data;

    return new Color({
      r: data[0],
      g: data[1],
      b: data[2],
      a: data[3] / 255,
    });
  }

  protected override collectAsyncResources() {
    super.collectAsyncResources();
    this.image();
  }
}
