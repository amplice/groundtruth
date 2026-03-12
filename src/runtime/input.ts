export class InputController {
  private readonly pressed = new Set<string>();

  private readonly justPressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  isPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  consumePress(code: string): boolean {
    if (!this.justPressed.has(code)) {
      return false;
    }
    this.justPressed.delete(code);
    return true;
  }

  movementAxes(): { x: number; z: number; sprint: boolean } {
    let x = 0;
    let z = 0;
    if (this.isPressed("KeyA") || this.isPressed("ArrowLeft")) {
      x -= 1;
    }
    if (this.isPressed("KeyD") || this.isPressed("ArrowRight")) {
      x += 1;
    }
    if (this.isPressed("KeyW") || this.isPressed("ArrowUp")) {
      z += 1;
    }
    if (this.isPressed("KeyS") || this.isPressed("ArrowDown")) {
      z -= 1;
    }

    return {
      x,
      z,
      sprint: this.isPressed("ShiftLeft") || this.isPressed("ShiftRight"),
    };
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.pressed.has(event.code)) {
      this.justPressed.add(event.code);
    }
    this.pressed.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
    this.justPressed.clear();
  };
}
