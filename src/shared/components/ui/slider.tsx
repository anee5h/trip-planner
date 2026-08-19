import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "@/shared/utils/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max];

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 h-full min-h-12">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 select-none h-3 w-full cursor-pointer"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-emerald-700 select-none h-full absolute left-0 top-0"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="relative block size-7 shrink-0 rounded-full border-2 border-emerald-700 bg-white ring-emerald-500/30 shadow-md transition-[color,box-shadow,transform] select-none hover:scale-110 active:scale-95 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing z-10"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
