import React from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';

interface DateTimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  className?: string;
  placeholder?: string;
}

export function DateTimePicker({ value, onChange, className, placeholder }: DateTimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [timeValue, setTimeValue] = React.useState(
    format(value, 'HH:mm')
  );

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      const [hours, minutes] = timeValue.split(':').map(Number);
      const newDate = new Date(selectedDate);
      newDate.setHours(hours, minutes);
      onChange(newDate);
    }
  };

  const handleTimeChange = (time: string) => {
    setTimeValue(time);
    const [hours, minutes] = time.split(':').map(Number);
    const newDate = new Date(value);
    newDate.setHours(hours, minutes);
    onChange(newDate);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? (
            format(value, 'yyyy-MM-dd HH:mm')
          ) : (
            <span>{placeholder || '选择日期和时间'}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleDateSelect}
            initialFocus
          />
          <div className="mt-3 border-t pt-3">
            <Label htmlFor="time" className="text-sm font-medium">
              时间
            </Label>
            <div className="flex items-center space-x-2 mt-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Input
                id="time"
                type="time"
                value={timeValue}
                onChange={(e) => handleTimeChange(e.target.value)}
                className="w-32"
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}