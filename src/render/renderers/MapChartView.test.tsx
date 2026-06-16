import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Path, Circle } from 'react-native-svg';
import '@/ui/i18n';
import { MapChartView } from './MapChartView';
import type { PointSelectInfo } from '@/viz/drill/pointSelect';
import type { QueryResult } from '@/api/schemas';

const col = (name: string, baseType: string, semanticType: string | null = null) => ({
  name,
  displayName: name,
  baseType,
  semanticType,
  fieldId: null,
});

const statesResult: QueryResult = {
  cols: [col('state', 'type/Text', 'type/State'), col('total', 'type/Integer')],
  rows: [
    ['California', 1000],
    ['Texas', 500],
    ['New York', 250],
  ],
  rowCount: 3,
  status: 'completed',
  error: null,
};

const pinResult: QueryResult = {
  cols: [
    col('lat', 'type/Float', 'type/Latitude'),
    col('lng', 'type/Float', 'type/Longitude'),
    col('city', 'type/Text'),
  ],
  rows: [
    [37.77, -122.42, 'San Francisco'],
    [40.71, -74.0, 'New York'],
    [null, -90.0, 'BadRow'],
    [34.05, -118.24, 'Los Angeles'],
  ],
  rowCount: 4,
  status: 'completed',
  error: null,
};

describe('MapChartView — choropleth (region)', () => {
  it('renders one polygon per region feature colored by data', async () => {
    const { UNSAFE_getAllByType } = await render(
      <MapChartView result={statesResult} vizSettings={{}} display="state" />,
    );
    const paths = UNSAFE_getAllByType(Path);
    // 52 bundled US features (some may render); at least the 50+ states.
    expect(paths.length).toBeGreaterThan(40);
  });

  it('colors joined regions differently from no-data regions', async () => {
    await render(<MapChartView result={statesResult} vizSettings={{}} display="state" />);
    // react-native-svg normalizes the `fill` prop into an internal color object,
    // so compare normalized fills rather than raw hex strings. California has data
    // (1000); Wyoming has none — their fills must differ.
    const caFill = screen.getByTestId('region-ca').props.fill;
    const wyFill = screen.getByTestId('region-wy').props.fill;
    expect(caFill).not.toEqual(wyFill);
  });

  it('paints all no-data regions with the same neutral fill', async () => {
    await render(<MapChartView result={statesResult} vizSettings={{}} display="state" />);
    // Wyoming and Montana both have no row -> identical no-data fill.
    const wyFill = screen.getByTestId('region-wy').props.fill;
    const mtFill = screen.getByTestId('region-mt').props.fill;
    expect(wyFill).toEqual(mtFill);
    // ...and that fill differs from a region WITH data.
    expect(wyFill).not.toEqual(screen.getByTestId('region-ca').props.fill);
  });

  it('renders a legend with value buckets', async () => {
    await render(<MapChartView result={statesResult} vizSettings={{}} display="state" />);
    expect(screen.getByTestId('map-legend')).toBeTruthy();
  });

  it('shows a tooltip and reports onPointSelect when a region is tapped', async () => {
    const onPointSelect = jest.fn<void, [PointSelectInfo]>();
    await render(
      <MapChartView
        result={statesResult}
        vizSettings={{}}
        display="state"
        onPointSelect={onPointSelect}
      />,
    );
    expect(screen.queryByTestId('map-tooltip')).toBeNull();
    fireEvent.press(screen.getByTestId('region-ca'));
    expect(screen.getByTestId('map-tooltip')).toBeTruthy();
    expect(screen.getByText('California')).toBeTruthy();
    expect(onPointSelect).toHaveBeenCalledTimes(1);
    const info = onPointSelect.mock.calls[0]![0];
    expect(info.label).toBe('California');
    expect(info.points[0]?.value).toBe(1000);
    expect(info.dimensionColumnName).toBe('state');
    // The default fixture's dimension carries no field id.
    expect(info).not.toHaveProperty('dimensionFieldId');
  });

  it('reports the dimension field id to onPointSelect when the dimension carries one', async () => {
    const onPointSelect = jest.fn<void, [PointSelectInfo]>();
    const withFieldId: QueryResult = {
      cols: [
        { ...col('state', 'type/Text', 'type/State'), fieldId: 42 },
        col('total', 'type/Integer'),
      ],
      rows: [
        ['California', 1000],
        ['Texas', 500],
      ],
      rowCount: 2,
      status: 'completed',
      error: null,
    };
    await render(
      <MapChartView
        result={withFieldId}
        vizSettings={{}}
        display="state"
        onPointSelect={onPointSelect}
      />,
    );
    fireEvent.press(screen.getByTestId('region-ca'));
    expect(onPointSelect).toHaveBeenCalledTimes(1);
    const info = onPointSelect.mock.calls[0]![0];
    expect(info.dimensionColumnName).toBe('state');
    expect(info.dimensionFieldId).toBe(42);
  });

  it('joins world countries by ISO code', async () => {
    const world: QueryResult = {
      cols: [col('country', 'type/Text', 'type/Country'), col('users', 'type/Integer')],
      rows: [
        ['US', 5000],
        ['DE', 1200],
        ['BR', 800],
      ],
      rowCount: 3,
      status: 'completed',
      error: null,
    };
    await render(<MapChartView result={world} vizSettings={{}} display="country" />);
    // A country with no data (e.g. Canada) defines the no-data fill; joined
    // countries must differ from it.
    const noData = screen.getByTestId('region-ca').props.fill; // Canada -> no row
    expect(screen.getByTestId('region-us').props.fill).not.toEqual(noData);
    expect(screen.getByTestId('region-de').props.fill).not.toEqual(noData);
  });
});

describe('MapChartView — pin', () => {
  it('renders one marker per valid point (null coords dropped)', async () => {
    const { UNSAFE_getAllByType } = await render(
      <MapChartView result={pinResult} vizSettings={{ 'map.type': 'pin' }} display="pin_map" />,
    );
    // 3 markers (BadRow dropped). The world backdrop adds Paths, not Circles.
    const markers = UNSAFE_getAllByType(Circle);
    expect(markers).toHaveLength(3);
  });

  it('reports onPointSelect when a marker is tapped', async () => {
    const onPointSelect = jest.fn<void, [PointSelectInfo]>();
    await render(
      <MapChartView
        result={pinResult}
        vizSettings={{ 'map.type': 'pin' }}
        display="pin_map"
        onPointSelect={onPointSelect}
      />,
    );
    fireEvent.press(screen.getByTestId('pin-0'));
    expect(screen.getByTestId('map-tooltip')).toBeTruthy();
    expect(onPointSelect).toHaveBeenCalledTimes(1);
  });

  it('sizes markers by a metric column when configured', async () => {
    const withMetric: QueryResult = {
      cols: [
        col('lat', 'type/Float', 'type/Latitude'),
        col('lng', 'type/Float', 'type/Longitude'),
        col('pop', 'type/Integer'),
      ],
      rows: [
        [10, 10, 100],
        [20, 20, 300],
        [30, 30, 200],
      ],
      rowCount: 3,
      status: 'completed',
      error: null,
    };
    const { UNSAFE_getAllByType } = await render(
      <MapChartView
        result={withMetric}
        vizSettings={{ 'map.type': 'pin', 'map.metric_column': 'pop' }}
        display="pin_map"
      />,
    );
    const radii = UNSAFE_getAllByType(Circle).map((c) => Number(c.props.r));
    expect(Math.max(...radii)).toBeGreaterThan(Math.min(...radii));
  });
});

describe('MapChartView — fallback', () => {
  it('falls back to a table when no region/metric can be resolved', async () => {
    const noGeo: QueryResult = {
      cols: [col('label', 'type/Text'), col('value', 'type/Integer')],
      rows: [['a', 1]],
      rowCount: 1,
      status: 'completed',
      error: null,
    };
    await render(<MapChartView result={noGeo} vizSettings={{}} display="map" />);
    expect(screen.getByText('Please select a region map')).toBeTruthy();
    // Table still renders the rows: header column name is present.
    expect(screen.getByText('label')).toBeTruthy();
  });

  it('falls back when lat/long columns are missing for a pin map', async () => {
    const noLatLng: QueryResult = {
      cols: [col('lat', 'type/Float', 'type/Latitude'), col('city', 'type/Text')],
      rows: [[1, 'x']],
      rowCount: 1,
      status: 'completed',
      error: null,
    };
    await render(
      <MapChartView result={noLatLng} vizSettings={{ 'map.type': 'pin' }} display="pin_map" />,
    );
    expect(screen.getByText('Please select longitude and latitude columns')).toBeTruthy();
  });

  it('falls back for unsupported grid/heat map types', async () => {
    await render(
      <MapChartView result={statesResult} vizSettings={{ 'map.type': 'grid' }} display="map" />,
    );
    expect(screen.getByText('This map type is not supported')).toBeTruthy();
  });

  it('falls back for an unknown/custom region id', async () => {
    await render(
      <MapChartView
        result={statesResult}
        vizSettings={{ 'map.type': 'region', 'map.region': 'mars_regions' }}
        display="map"
      />,
    );
    expect(screen.getByText('That region map is not available')).toBeTruthy();
  });
});
