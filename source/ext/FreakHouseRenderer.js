// ==UserScript==
// @unsandboxed
// ==/UserScript==
//Freak House Renderer
//Dinde451
(function (Scratch) {
  "use strict";
  if (!Scratch.extensions.unsandboxed) {
    throw new Error("This extension must run unsandboxed");
  }
  const vm = Scratch.vm;
  const runtime = vm.runtime;
  const renderer = vm.renderer;

  function playBeep(freq, dur, vol) {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.value = freq || 440;
      var t = ctx.currentTime + 0.01;
      gain.gain.setValueAtTime(vol || 0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.07));
      osc.start(t);
      osc.stop(t + (dur || 0.07));
      osc.addEventListener("ended", function () {
        ctx.close();
      });
    } catch (e) {}
  }

  class FHRenderer {
    getInfo() {
      return {
        id: "penpixelate",
        name: "Freak House Renderer",
        color1: "#33691e",
        color2: "#255214",
        color3: "#230000",
        blocks: [
          {
            opcode: "setPixelate",
            blockType: Scratch.BlockType.COMMAND,
            text: "Freak House Pixel Renderer [VALUE]",
            arguments: {
              VALUE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 25
              }
            }
          },
          {
            opcode: "beepFull",
            blockType: Scratch.BlockType.COMMAND,
            text: "beep at [FREQ] hz for [DUR] s volume [VOL]",
            arguments: {
              FREQ: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 440
              },
              DUR: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0.07
              },
              VOL: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0.08
              }
            }
          }
        ]
      };
    }

    setPixelate(args) {
      const penID = runtime.ext_pen?._penDrawableId;
      if (penID === undefined) return;
      const drawable = renderer._allDrawables[penID];
      if (!drawable) return;
      drawable.updateEffect("pixelate", Number(args.VALUE));
    }

    beepFull(args) {
      playBeep(Number(args.FREQ), Number(args.DUR), Number(args.VOL));
    }
  }

  Scratch.extensions.register(new FHRenderer());
})(Scratch);
