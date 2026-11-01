import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { useState } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Button, Input, Modal, Select, StatusBadge, Table, type TableColumn } from '.';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

describe('Button', () => {
  it('runs onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>حفظ</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is busy and not clickable while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        حفظ
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'حفظ' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>حفظ</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('Input', () => {
  it('is labelled and shows its hint', () => {
    render(<Input label="الاسم الكامل" hint="متل ما مكتوب بالهوية" required />);

    const input = screen.getByLabelText(/الاسم الكامل/);
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription('متل ما مكتوب بالهوية');
  });

  it('marks itself invalid and announces the error instead of the hint', () => {
    render(<Input label="الموبايل" hint="مثال: 0991234567" error="رقم غير صحيح" />);

    const input = screen.getByLabelText('الموبايل');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('رقم غير صحيح');
    expect(screen.getByRole('alert')).toHaveTextContent('رقم غير صحيح');
    expect(screen.queryByText('مثال: 0991234567')).not.toBeInTheDocument();
  });

  it('forwards ref so React Hook Form can register it', () => {
    let element: HTMLInputElement | null = null;
    render(
      <Input
        label="الاسم"
        ref={(el) => {
          element = el;
        }}
      />,
    );
    expect(element).toBeInstanceOf(HTMLInputElement);
  });
});

describe('Select', () => {
  const options = [
    { value: 'er', label: 'الإسعاف' },
    { value: 'or', label: 'العمليات' },
  ];

  it('starts on the placeholder instead of silently picking the first option', () => {
    render(<Select label="القسم" placeholder="اختار القسم" options={options} required />);
    expect(screen.getByLabelText(/القسم/)).toHaveValue('');
  });

  it('lets the user pick an option', async () => {
    render(<Select label="القسم" placeholder="اختار القسم" options={options} />);

    await userEvent.selectOptions(screen.getByLabelText('القسم'), 'or');
    expect(screen.getByLabelText('القسم')).toHaveValue('or');
  });
});

describe('Table', () => {
  type Row = { id: string; name: string };
  const columns: TableColumn<Row>[] = [{ key: 'name', header: 'الاسم', cell: (r) => r.name }];

  it('renders a captioned table and a phone card list with the same rows', () => {
    render(
      <Table
        caption="الموظفين"
        columns={columns}
        rows={[{ id: '1', name: 'سامر' }]}
        getRowKey={(r) => r.id}
      />,
    );

    const table = screen.getByRole('table', { name: 'الموظفين' });
    expect(within(table).getByText('سامر')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'الموظفين' });
    expect(within(list).getByText('سامر')).toBeInTheDocument();
  });

  it('shows a translated empty message when there are no rows', () => {
    render(<Table caption="x" columns={columns} rows={[]} getRowKey={(r) => r.id} />);
    expect(screen.getByText('ما في بيانات لعرضها')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    render(<Table caption="x" columns={columns} rows={[]} loading getRowKey={(r) => r.id} />);
    expect(screen.getByRole('status', { name: 'جاري التحميل' })).toBeInTheDocument();
  });
});

describe('Modal', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>افتح</button>
        <Modal open={open} onClose={() => setOpen(false)} title="مريض جديد" description="وصف">
          <Input label="الاسم" />
          <button>زر تاني</button>
        </Modal>
      </>
    );
  }

  it('opens as a labelled dialog and focuses the first field', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'افتح' }));

    const dialog = screen.getByRole('dialog', { name: 'مريض جديد' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('وصف');
    await waitFor(() => expect(screen.getByLabelText('الاسم')).toHaveFocus());
  });

  it('closes on Escape and returns focus to the opener', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'افتح' });
    await userEvent.click(opener);
    await waitFor(() => expect(screen.getByLabelText('الاسم')).toHaveFocus());

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('closes from the close button', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'افتح' }));

    await userEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps Tab focus inside the dialog', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'افتح' }));
    await waitFor(() => expect(screen.getByLabelText('الاسم')).toHaveFocus());

    await userEvent.tab(); // -> "زر تاني" (last)
    await userEvent.tab(); // wraps -> close button (first)
    expect(screen.getByRole('button', { name: 'إغلاق' })).toHaveFocus();
    await userEvent.tab({ shift: true }); // wraps back -> last
    expect(screen.getByRole('button', { name: 'زر تاني' })).toHaveFocus();
  });

  it('locks page scroll while open', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'افتح' }));
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.body.style.overflow).toBe(''));
  });
});

describe('StatusBadge', () => {
  it('renders its label', () => {
    render(<StatusBadge tone="esi-1">ESI 1</StatusBadge>);
    expect(screen.getByText('ESI 1')).toBeInTheDocument();
  });
});
