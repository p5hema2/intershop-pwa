import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Observable } from 'rxjs/Observable';
import { HeaderNavigationComponent } from './header-navigation.component';
import { RouterTestingModule } from '@angular/router/testing';
import { CategoryService } from '../../../services/categories/category.service';
import { CategoriesMock, SubCategoriesMock } from '../../../services/categories/categories.mock';
import { CacheCustomService } from '../../../services/cache/cache-custom.service';
import { mock, instance, when, anything, verify } from 'ts-mockito';
import { CategoryModel } from '../../../services/categories/category.model';
import { SubcategoryModel } from '../../../services/categories/subcategory.model';
import { LocalizeRouterService } from '../../../services/routes-parser-locale-currency/localize-router.service';
import { GlobalState } from '../../../services/global.state';

describe('Header Navigation Component', () => {
  let fixture: ComponentFixture<HeaderNavigationComponent>;
  let component: HeaderNavigationComponent;
  let element: HTMLElement;
  let cacheCustomServiceMock: CacheCustomService;
  let categoryServiceMock: CategoryService;
  let localizeRouterServiceMock: LocalizeRouterService;
  let globalStateMock: GlobalState;

  beforeEach(() => {
    cacheCustomServiceMock = mock(CacheCustomService);
    when(cacheCustomServiceMock.cacheKeyExists(anything())).thenReturn(false);
    when(cacheCustomServiceMock.getCachedData('Cameras')).thenReturn(SubCategoriesMock[0]);

    categoryServiceMock = mock(CategoryService);
    when(categoryServiceMock.getCategories()).thenReturn(Observable.of(CategoriesMock as CategoryModel));
    when(categoryServiceMock.getSubCategories('Cameras')).thenReturn(Observable.of(SubCategoriesMock[0] as SubcategoryModel));

    localizeRouterServiceMock = mock(LocalizeRouterService);
    when(localizeRouterServiceMock.translateRoute('/category')).thenReturn('/category');
    when(localizeRouterServiceMock.translateRoute('/home')).thenReturn('/home');
    globalStateMock = mock(GlobalState);

    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [
        HeaderNavigationComponent
      ],
      providers: [
        { provide: CacheCustomService, useFactory: () => instance(cacheCustomServiceMock) },
        { provide: CategoryService, useFactory: () => instance(categoryServiceMock) },
        { provide: LocalizeRouterService, useFactory: () => instance(localizeRouterServiceMock) },
        { provide: GlobalState, useFactory: () => instance(globalStateMock) }
      ]
    })
      .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HeaderNavigationComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
    expect(element).toBeTruthy();
  });

  it('should initialized with categories when created', () => {
    fixture.detectChanges();

    expect(component.categories).toBeTruthy();
    expect(component.categories.elements.length).toBeGreaterThan(0);
  });

  it('should render mocked category data on template', () => {
    fixture.detectChanges();

    const categories = element.getElementsByClassName('dropdown');
    expect(categories[0].children[0].textContent).toContain('Cameras');
    expect(categories[1].children[0].textContent).toContain('Computers');
    expect(categories[2].children[0].textContent).toContain('Home Entertainment');
    expect(categories[3].children[0].textContent).toContain('Specials');
  });

  it('should get Subcategories data from Category Service when no cache is available', () => {
    component.getSubCategories('Cameras');

    verify(categoryServiceMock.getSubCategories(anything())).once();
    verify(cacheCustomServiceMock.getCachedData(anything())).never();
    expect(component.subCategories).toBeTruthy();
    expect(component.subCategories.subCategories.length).toBeGreaterThan(0);
  });

  it('should get Subcategories data from CacheCustom Service if available', () => {
    when(cacheCustomServiceMock.cacheKeyExists('Cameras')).thenReturn(true);
    component.getSubCategories('Cameras');

    verify(categoryServiceMock.getSubCategories(anything())).once();
    verify(cacheCustomServiceMock.getCachedData(anything())).never();
    expect(component.subCategories).toBeTruthy();
    expect(component.subCategories.subCategories.length).toBeGreaterThan(0);
  });
});

