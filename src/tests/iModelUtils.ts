/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Id64, Id64String } from "@bentley/bentleyjs-core";
import { Range3d } from "@bentley/geometry-core";
import { AuxCoordSystem2d, BackendRequestContext, CategorySelector, DefinitionModel, DocumentListModel, Drawing, DrawingCategory, ElementOwnsMultiAspects, ElementOwnsUniqueAspect, FunctionalSchema, GroupModel, IModelDb, InformationRecordModel, ModelSelector, PhysicalModel, Platform, SpatialCategory, SpatialLocationModel, SubCategory, Subject } from "@bentley/imodeljs-backend";
import { AuxCoordSystem2dProps, Code, CodeScopeSpec, ColorDef, FontType, IModel, SubCategoryAppearance } from "@bentley/imodeljs-common";
import { assert } from "chai";
import * as path from "path";

export async function prepareSourceDb(sourceDb: IModelDb): Promise<void> {
  const requestContext = new BackendRequestContext();
  const sourceSchemaFileName: string = path.join(__dirname, "assets", "TestPropsSchema-33.01.00.00.ecschema.xml");
  try {
    await sourceDb.importSchemas(requestContext, [sourceSchemaFileName]);
  } catch (e) {
    console.log(e);
  }

  FunctionalSchema.registerSchema();
}

function insertSpatialCategory(iModelDb: IModelDb, modelId: Id64String, categoryName: string, color: ColorDef): Id64String {
  const appearance: SubCategoryAppearance.Props = {
    color: color.toJSON(),
    transp: 0,
    invisible: false,
  };
  return SpatialCategory.insert(iModelDb, modelId, categoryName, appearance);
}

export function populateSourceDb(sourceDb: IModelDb): void {
  if (Platform.platformName.startsWith("win")) {
    sourceDb.embedFont({ id: 1, type: FontType.TrueType, name: "Arial" });
    assert.exists(sourceDb.fontMap.getFont("Arial"));
    assert.exists(sourceDb.fontMap.getFont(1));
  }
  // initialize project extents
  const projectExtents = new Range3d(-1000, -1000, -1000, 1000, 1000, 1000);
  sourceDb.updateProjectExtents(projectExtents);

  // insert CodeSpecs
  const codeSpecId1: Id64String = sourceDb.codeSpecs.insert("SourceCodeSpec", CodeScopeSpec.Type.Model);
  const codeSpecId2: Id64String = sourceDb.codeSpecs.insert("ExtraCodeSpec", CodeScopeSpec.Type.ParentElement);
  const codeSpecId3: Id64String = sourceDb.codeSpecs.insert("InformationRecords", CodeScopeSpec.Type.Model);
  assert.isTrue(Id64.isValidId64(codeSpecId1));
  assert.isTrue(Id64.isValidId64(codeSpecId2));
  assert.isTrue(Id64.isValidId64(codeSpecId3));

  // insert RepositoryModel structure
  const subjectId = Subject.insert(sourceDb, IModel.rootSubjectId, "Subject", "Subject Description");
  assert.isTrue(Id64.isValidId64(subjectId));
  const sourceOnlySubjectId = Subject.insert(sourceDb, IModel.rootSubjectId, "Only in Source");
  assert.isTrue(Id64.isValidId64(sourceOnlySubjectId));
  const definitionModelId = DefinitionModel.insert(sourceDb, subjectId, "Definition");
  assert.isTrue(Id64.isValidId64(definitionModelId));
  const informationModelId = InformationRecordModel.insert(sourceDb, subjectId, "Information");
  assert.isTrue(Id64.isValidId64(informationModelId));
  const groupModelId = GroupModel.insert(sourceDb, subjectId, "Group");
  assert.isTrue(Id64.isValidId64(groupModelId));
  const physicalModelId = PhysicalModel.insert(sourceDb, subjectId, "Physical");
  assert.isTrue(Id64.isValidId64(physicalModelId));
  const spatialLocationModelId = SpatialLocationModel.insert(sourceDb, subjectId, "SpatialLocation", true);
  assert.isTrue(Id64.isValidId64(spatialLocationModelId));
  // const functionalModelId = FunctionalModel.insert(sourceDb, subjectId, "Functional");
  // assert.isTrue(Id64.isValidId64(functionalModelId));
  const documentListModelId = DocumentListModel.insert(sourceDb, subjectId, "Document");
  assert.isTrue(Id64.isValidId64(documentListModelId));
  const drawingId = Drawing.insert(sourceDb, documentListModelId, "Drawing");
  assert.isTrue(Id64.isValidId64(drawingId));
  // insert DefinitionElements
  const modelSelectorId = ModelSelector.insert(sourceDb, definitionModelId, "SpatialModels", [physicalModelId, spatialLocationModelId]);
  assert.isTrue(Id64.isValidId64(modelSelectorId));
  const spatialCategoryId = insertSpatialCategory(sourceDb, definitionModelId, "SpatialCategory", ColorDef.green);
  assert.isTrue(Id64.isValidId64(spatialCategoryId));
  const sourcePhysicalCategoryId = insertSpatialCategory(sourceDb, definitionModelId, "SourcePhysicalCategory", ColorDef.blue);
  assert.isTrue(Id64.isValidId64(sourcePhysicalCategoryId));
  const subCategoryId = SubCategory.insert(sourceDb, spatialCategoryId, "SubCategory", { color: ColorDef.blue.toJSON() });
  assert.isTrue(Id64.isValidId64(subCategoryId));
  const drawingCategoryId = DrawingCategory.insert(sourceDb, definitionModelId, "DrawingCategory", new SubCategoryAppearance());
  assert.isTrue(Id64.isValidId64(drawingCategoryId));
  // tslint:disable-next-line: max-line-length
  const spatialCategorySelectorId = CategorySelector.insert(sourceDb, definitionModelId, "SpatialCategories", [spatialCategoryId, sourcePhysicalCategoryId]);
  assert.isTrue(Id64.isValidId64(spatialCategorySelectorId));
  const drawingCategorySelectorId = CategorySelector.insert(sourceDb, definitionModelId, "DrawingCategories", [drawingCategoryId]);
  assert.isTrue(Id64.isValidId64(drawingCategorySelectorId));
  const auxCoordSystemProps: AuxCoordSystem2dProps = {
    classFullName: AuxCoordSystem2d.classFullName,
    model: definitionModelId,
    code: AuxCoordSystem2d.createCode(sourceDb, definitionModelId, "AuxCoordSystem2d"),
  };
  const auxCoordSystemId = sourceDb.elements.insertElement(auxCoordSystemProps);
  assert.isTrue(Id64.isValidId64(auxCoordSystemId));

  const toolBox = {
    classFullName: "TestPropsSchema:ToolBox",
    model: physicalModelId,
    code: Code.createEmpty(),
    category: spatialCategoryId,
    bestTool: {
      name: "Hammer",
      weight: "42.42",
    },
    worstTool: {
      name: "Feather",
    },
    tools: [
      {
        name: "Saw",
        weight: "11.02",
      },
      {
        name: "Drill",
        weight: "100.1",
      },
    ],
  };
  const toolBoxId = sourceDb.elements.insertElement(toolBox);
  assert.isTrue(Id64.isValidId64(toolBoxId));

  const people = {
    classFullName: "TestPropsSchema:People",
    model: physicalModelId,
    code: Code.createEmpty(),
    category: spatialCategoryId,
    PersonA: {
      Age: 52,
      Name: "John",
      PersonIQ: {
        Memory: 6,
        Perception: 8,
      },
    },
  };
  const peopleId = sourceDb.elements.insertElement(people);
  assert.isTrue(Id64.isValidId64(peopleId));

  const aspectElement = {
    classFullName: "TestPropsSchema:AspectElement",
    model: physicalModelId,
    code: Code.createEmpty(),
    category: spatialCategoryId,
    Type: "AspectOwningElement",
  };
  const aspectElementId = sourceDb.elements.insertElement(aspectElement);
  assert.isTrue(Id64.isValidId64(aspectElementId));

  const uniqueAspect = {
    classFullName: "TestPropsSchema:TestUniqueAspect",
    model: physicalModelId,
    code: Code.createEmpty(),
    element: new ElementOwnsUniqueAspect(aspectElementId),
    category: spatialCategoryId,
    Diameter: 12,
  };
  sourceDb.elements.insertAspect(uniqueAspect);

  const multiAspect = {
    classFullName: "TestPropsSchema:TestMultiAspect",
    model: physicalModelId,
    code: Code.createEmpty(),
    element: new ElementOwnsMultiAspects(aspectElementId),
    category: spatialCategoryId,
    TextSize: 5.5,
    TextFont: "Italics",
    Color: 2,
  };
  sourceDb.elements.insertAspect(multiAspect);

  const keywordsElement = {
    classFullName: "TestPropsSchema:KeyWordsElement",
    model: physicalModelId,
    code: Code.createEmpty(),
    category: spatialCategoryId,
    Offset: "FooBar",
    Count: 12,
    Limit: 10,
    Select: 10,
  };
  const keywordsElementId = sourceDb.elements.insertElement(keywordsElement);
  assert.isTrue(Id64.isValidId64(keywordsElementId));

  const testPhysicalType = {
    classFullName: "TestPropsSchema:TestPhysicalType",
    model: definitionModelId,
    code: Code.createEmpty(),
    category: spatialCategoryId,
  };
  const testPhysicalTypeId = sourceDb.elements.insertElement(testPhysicalType);
  assert.isTrue(Id64.isValidId64(testPhysicalTypeId));

  const testGeometricElement3d = {
    classFullName: "TestPropsSchema:TestGeomertric3dElement",
    model: physicalModelId,
    code: Code.createEmpty(),
    category: spatialCategoryId,
    typeDefinition: { id: testPhysicalTypeId, relClassName: "TestPropsSchema:TestGeomertric3dElementIsOfType" },
  };
  const testGeometricElement3dId = sourceDb.elements.insertElement(testGeometricElement3d);
  assert.isTrue(Id64.isValidId64(testGeometricElement3dId));

  const testGeometricElement2d = {
    classFullName: "TestPropsSchema:TestGeomertric2dElement",
    model: drawingId,
    code: Code.createEmpty(),
    category: drawingCategoryId,
    typeDefinition: { id: testPhysicalTypeId, relClassName: "TestPropsSchema:TestGeomertric2dElementIsOfType" },
  };
  const testGeometricElement2dId = sourceDb.elements.insertElement(testGeometricElement2d);
  assert.isTrue(Id64.isValidId64(testGeometricElement2dId));

  const derivedConcreteElement = {
    classFullName: "TestPropsSchema:DerivedConcreteElement",
    model: physicalModelId,
    code: Code.createEmpty(),
    category: spatialCategoryId,
    Length: 20,
    Width: 10,
  };
  const derivedConcreteElementId = sourceDb.elements.insertElement(derivedConcreteElement);
  assert.isTrue(Id64.isValidId64(derivedConcreteElementId));
}
