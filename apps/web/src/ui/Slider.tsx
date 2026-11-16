import { Slider as GlassSlider } from "glisse";

type Props = {
  id: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  valueText: string;
};

/** Liquid Glass slider from glisse, on top of a native range input (keyboard and VoiceOver work). */
export function Slider({ id, value, onChange, min, max, valueText }: Props) {
  return (
    <GlassSlider
      id={id}
      className="ui-slider"
      value={value}
      onValueChange={onChange}
      min={min}
      max={max}
      step={1}
      aria-valuetext={valueText}
    />
  );
}
